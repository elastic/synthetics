/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { APIRequestContext, APIResponse } from 'playwright-core';
import { NetworkInfo, APIDriver } from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

/**
 * Kibana UI expects the requestStartTime and loadEndTime to be baseline
 * in seconds as they have the logic to convert it to milliseconds before
 * using for offset calculation
 */
function epochTimeInSeconds() {
  return getTimestamp() / 1e6;
}

const roundMilliSecs = (ms: number): number => Math.floor(ms * 1000) / 1000;

/**
 * Playwright's `APIRequestContext.get/post/put/delete/patch/head` are
 * thin wrappers that funnel into `fetch(urlOrRequest, options)`, so we
 * only need to intercept `fetch` to capture every request exactly once.
 */
type RequestLike = string | { url(): string };

function normalizeUrl(urlOrRequest: RequestLike): string {
  if (typeof urlOrRequest === 'string') return urlOrRequest;
  try {
    return urlOrRequest.url();
  } catch {
    return String(urlOrRequest);
  }
}

/**
 * Best-effort byte size for a request body. Playwright accepts
 * `data` (string/Buffer/object), `form` (record), `multipart` (record)
 * and `postData` (Buffer/string). For unknown shapes we return 0 rather
 * than guess.
 */
function bodyBytes(body: unknown): number {
  if (body == null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.byteLength;
  if (body instanceof Uint8Array) return body.byteLength;
  if (typeof body === 'object') {
    try {
      return Buffer.byteLength(JSON.stringify(body));
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Sum of `name: value\r\n` lengths for ECS `request/response.bytes`
 * which includes headers plus body.
 */
function headersBytes(headers: Record<string, string>): number {
  let total = 0;
  for (const [k, v] of Object.entries(headers ?? {})) {
    total += Buffer.byteLength(k) + Buffer.byteLength(String(v)) + 4; // ": " + CRLF
  }
  return total;
}

export class APINetworkManager {
  results: Array<NetworkInfo> = [];
  _currentStep: Partial<Step> | null = null;
  private _originalFetch?: APIRequestContext['fetch'];
  private _patched = false;

  constructor(private driver: APIDriver) {}

  async start() {
    if (this._patched) return;
    log(`Plugins: started collecting API network events`);
    const request = this.driver.request;
    this._originalFetch = request.fetch.bind(request);
    (request as any).fetch = (urlOrRequest: RequestLike, options?: any) =>
      this._interceptRequest(urlOrRequest, options);
    this._patched = true;
  }

  private async _interceptRequest(
    urlOrRequest: RequestLike,
    options?: any
  ): Promise<APIResponse> {
    const url = normalizeUrl(urlOrRequest);
    const timestamp = getTimestamp();
    const requestSentTime = epochTimeInSeconds();
    const httpMethod = (options?.method ?? 'GET').toUpperCase();

    log(`API network: ${httpMethod} ${url}`);

    const requestBody = options?.postData ?? options?.data;
    const requestBodyBytes = bodyBytes(requestBody);
    const requestHeaders = options?.headers ?? {};

    const entry: NetworkInfo = {
      step: this._currentStep,
      timestamp,
      url,
      type: 'fetch',
      isNavigationRequest: false,
      browser: { name: 'api', version: '' },
      request: {
        url,
        method: httpMethod,
        headers: requestHeaders,
        bytes: headersBytes(requestHeaders) + requestBodyBytes,
        body: requestBodyBytes > 0 ? { bytes: requestBodyBytes } : undefined,
      },
      response: {
        status: -1,
        headers: {},
        mimeType: 'x-unknown',
      },
      requestSentTime,
      loadEndTime: -1,
      responseReceivedTime: -1,
      resourceSize: 0,
      transferSize: 0,
      timings: {
        blocked: -1,
        dns: -1,
        ssl: -1,
        connect: -1,
        send: -1,
        wait: -1,
        receive: -1,
        total: -1,
      },
    };
    this.results.push(entry);

    const wallStart = Date.now();
    try {
      const response = (await this._originalFetch(
        urlOrRequest as any,
        options
      )) as APIResponse;
      const wallEnd = Date.now();
      const headers = response.headers();

      /**
       * Determine response body size. Prefer the server-advertised
       * `Content-Length` when present (cheap, zero-copy); fall back to
       * the actual body buffer length only when the header is missing
       * (typical for chunked responses).
       */
      const contentLength = parseContentLength(headers['content-length']);
      let responseBodyBytes = contentLength;
      if (responseBodyBytes < 0) {
        try {
          const buf = await response.body();
          responseBodyBytes = buf?.byteLength ?? 0;
        } catch {
          responseBodyBytes = 0;
        }
      }
      const responseHeaderBytes = headersBytes(headers);
      const transferBytes = responseHeaderBytes + responseBodyBytes;
      entry.response = {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers,
        mimeType: headers['content-type'] ?? 'x-unknown',
        bytes: transferBytes,
        body: { bytes: responseBodyBytes },
      };
      entry.transferSize = transferBytes;
      entry.resourceSize = responseBodyBytes;
      entry.responseReceivedTime = epochTimeInSeconds();
      entry.loadEndTime = entry.responseReceivedTime;
      const wait = roundMilliSecs(wallEnd - wallStart);
      entry.timings.wait = wait;
      entry.timings.receive = 0;
      entry.timings.total = wait;

      /**
       * Read TLS and remote-socket info straight off the response.
       * `securityDetails()`/`serverAddr()` (Playwright >= 1.61) capture
       * these from the connection used by the actual request — following
       * redirects to the final hop — and resolve to `null` for non-HTTPS
       * or when the address is unavailable. The JSON reporter already
       * tolerates `securityDetails` being undefined.
       */
      const [serverAddr, securityDetails] = await Promise.all([
        response.serverAddr(),
        response.securityDetails(),
      ]);
      if (serverAddr) {
        entry.response.remoteIPAddress = serverAddr.ipAddress;
        entry.response.remotePort = serverAddr.port;
      }
      if (securityDetails) {
        entry.response.securityDetails = {
          ...securityDetails,
          protocol: normalizeTLSProtocol(securityDetails.protocol),
        };
      }
      return response;
    } catch (error) {
      entry.responseReceivedTime = epochTimeInSeconds();
      entry.loadEndTime = entry.responseReceivedTime;
      entry.timings.total = roundMilliSecs(Date.now() - wallStart);
      throw error;
    }
  }

  /**
   * Drop the own-property `fetch` so the prototype method becomes
   * reachable again. This keeps the `APIRequestContext` usable after the
   * plugin stops, e.g. when external code retains a reference.
   */
  private _restore() {
    if (!this._patched) return;
    delete (this.driver.request as any).fetch;
    this._originalFetch = undefined;
    this._patched = false;
  }

  async stop() {
    this._restore();
    log(`Plugins: stopped collecting API network events`);
    return this.results;
  }
}

function parseContentLength(raw: string | undefined): number {
  if (!raw) return -1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/**
 * `APIResponse.securityDetails()` reports the protocol as Node does, e.g.
 * `"TLSv1.3"`, whereas the browser path and the JSON reporter expect the
 * space-separated `"TLS 1.3"` shape (the reporter splits on the space to
 * derive `tls.version_protocol` / `tls.version`). Normalize so both
 * journey types emit consistent ECS fields.
 */
function normalizeTLSProtocol(raw?: string): string | undefined {
  if (!raw) return undefined;
  // "TLSv1.3" -> "TLS 1.3", "SSLv3" -> "SSL 3"; an already-spaced
  // "TLS 1.3" is left untouched (no `v` precedes the version digits).
  return raw.replace(/\s*v(?=\d)/i, ' ');
}

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

import { connect as tlsConnect, PeerCertificate } from 'tls';
import { Frame, Page, Request, Response } from 'playwright-core';
import {
  NetworkInfo,
  BrowserInfo,
  Driver,
  SecurityDetails,
} from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

/**
 * Chromium network errors that indicate the navigation failed during TLS
 * certificate validation. For these, Chromium fires `Network.loadingFailed`
 * instead of a response, so no `securityDetails` is captured and we recover the
 * certificate via a direct TLS probe.
 */
const CERTIFICATE_ERROR = /ERR_CERT|ERR_SSL/;

const CERT_PROBE_TIMEOUT = 5000;

/**
 * Node returns protocols as e.g. `TLSv1.3`, while the CDP `securityDetails`
 * (and downstream `formatTLS`) expect the `TLS 1.3` form.
 */
function normalizeProtocol(protocol?: string): string | undefined {
  if (!protocol) return undefined;
  const match = protocol.match(/^TLSv([\d.]+)$/);
  return match ? `TLS ${match[1]}` : protocol;
}

function toEpochSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

function toSecurityDetails(
  cert: PeerCertificate,
  protocol: string | null
): SecurityDetails | undefined {
  // An empty object is returned when no peer certificate is available.
  if (!cert || !cert.valid_to) return undefined;
  return {
    protocol: normalizeProtocol(protocol ?? undefined),
    issuer: cert.issuer?.CN,
    subjectName: cert.subject?.CN,
    validFrom: toEpochSeconds(cert.valid_from),
    validTo: toEpochSeconds(cert.valid_to),
  };
}

/**
 * Kibana UI expects the requestStartTime and loadEndTime to be baseline
 * in seconds as they have the logic to convert it to milliseconds before
 * using for offset calculation
 */
function epochTimeInSeconds() {
  return getTimestamp() / 1e6;
}

/**
 * Find the first positive number in an array for Resource timing data
 */
const firstPositive = (numbers: number[]) => {
  for (let i = 0; i < numbers.length; ++i) {
    if (numbers[i] > 0) {
      return numbers[i];
    }
  }
  return null;
};

const roundMilliSecs = (value: number): number => {
  return Math.floor(value * 1000) / 1000;
};

/**
 * Used as a key in each Network Request to identify the
 * associated request across distinct lifecycle events
 */
export const NETWORK_ENTRY_SUMBOL = Symbol.for('NetworkEntry');

type RequestWithEntry = Request & {
  NETWORK_ENTRY_SUMBOL?: symbol;
};

export class NetworkManager {
  private _browser: BrowserInfo;
  private _barrierPromises = new Set<Promise<void>>();
  /**
   * In-flight TLS probes used to recover certificate details for navigations
   * that fail cert validation. Awaited (with per-probe timeouts) on stop so the
   * details are present before the results are reported.
   */
  private _certProbes = new Set<Promise<void>>();
  /**
   * Memoizes the TLS probe per origin so multiple failed requests to the same
   * host trigger only one outbound connection.
   */
  private _certProbeCache = new Map<
    string,
    Promise<SecurityDetails | undefined>
  >();
  results: Array<NetworkInfo> = [];
  _currentStep: Partial<Step> = null;

  constructor(private driver: Driver) {}

  /**
   * Adds a protection barrier aganist all asynchronous extract operations from
   * request/response object that are happening during page lifecycle, If the
   * page is closed during the extraction, the barrier enforces those operations
   * to not result in exception
   */
  private _addBarrier(page: Page, promise: Promise<void>) {
    if (!page) return;
    const race = Promise.race([
      new Promise<void>(resolve =>
        page.on('close', () => {
          this._barrierPromises.delete(race);
          resolve();
        })
      ),
      promise,
    ]);
    this._barrierPromises.add(race);
    race.then(() => this._barrierPromises.delete(race));
  }

  private _nullableFrameBarrier(req: Request): Frame | null {
    try {
      return req.frame();
    } catch (_) {
      // frame might be unavailable for certain requests if they are issued
      // before the frame is created - true for navigation requests
      // https://playwright.dev/docs/api/class-request#request-frame
    }
    return null;
  }

  async start() {
    log(`Plugins: started collecting network events`);
    const { client, context } = this.driver;
    const { product } = await client.send('Browser.getVersion');
    const [name, version] = product.split('/');
    this._browser = { name, version };
    /**
     * Listen for all network events from PW context
     */
    context.on('request', this._onRequest.bind(this));
    context.on('response', this._onResponse.bind(this));
    context.on('requestfinished', this._onRequestCompleted.bind(this));
    context.on('requestfailed', this._onRequestCompleted.bind(this));
  }

  private _findNetworkEntry(
    request: RequestWithEntry
  ): NetworkInfo | undefined {
    return request[NETWORK_ENTRY_SUMBOL];
  }

  private _onRequest(request: Request) {
    const url = request.url();
    /**
     * Data URI should not show up as network requests
     */
    if (url.startsWith('data:')) {
      return;
    }

    const timestamp = getTimestamp();
    const networkEntry: NetworkInfo = {
      browser: this._browser,
      step: this._currentStep,
      timestamp,
      url,
      type: request.resourceType(),
      request: {
        url,
        method: request.method(),
        headers: request.headers(),
        body: {
          bytes: request.postDataBuffer()?.length || 0,
        },
      },
      response: {
        status: -1,
        headers: {},
        mimeType: 'x-unknown',
        redirectURL: '',
      },
      isNavigationRequest: request.isNavigationRequest(),
      requestSentTime: epochTimeInSeconds(),
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

    if (request.redirectedFrom()) {
      const fromEntry = this._findNetworkEntry(request.redirectedFrom());
      if (fromEntry) fromEntry.response.redirectURL = request.url();
    }

    request[NETWORK_ENTRY_SUMBOL] = networkEntry;
    this.results.push(networkEntry);
  }

  private async _onResponse(response: Response) {
    const request = response.request();
    const networkEntry = this._findNetworkEntry(request);
    if (!networkEntry) return;

    networkEntry.responseReceivedTime = epochTimeInSeconds();
    networkEntry.response = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: {},
      mimeType: 'x-unknown',
      redirectURL: networkEntry.response.redirectURL,
    };

    // Gather all resource timing information up until the
    // TTFB(Time to first byte) is received
    const timing = request.timing();
    const blocked =
      roundMilliSecs(
        firstPositive([
          timing.domainLookupStart,
          timing.connectStart,
          timing.requestStart,
        ])
      ) || -1;
    const dns =
      timing.domainLookupEnd !== -1
        ? roundMilliSecs(timing.domainLookupEnd - timing.domainLookupStart)
        : -1;
    const connect =
      timing.connectEnd !== -1
        ? roundMilliSecs(timing.connectEnd - timing.connectStart)
        : -1;
    const ssl =
      timing.secureConnectionStart !== -1
        ? roundMilliSecs(timing.connectEnd - timing.secureConnectionStart)
        : -1;
    const wait =
      timing.responseStart !== -1
        ? roundMilliSecs(timing.responseStart - timing.requestStart)
        : -1;

    networkEntry.timings = {
      blocked,
      dns,
      ssl,
      connect,
      send: 0, // not exposed via RT api
      wait,
      receive: -1, // will be available after full response is received
      total: -1,
    };
    this._calcTotalTime(networkEntry, timing);

    const frame = this._nullableFrameBarrier(request);
    const page = frame?.page();
    this._addBarrier(
      page,
      request.allHeaders().then(reqHeaders => {
        networkEntry.request.headers = reqHeaders;
        networkEntry.request.referrer = reqHeaders?.referer;
      })
    );
    this._addBarrier(
      page,
      response.allHeaders().then(resHeaders => {
        networkEntry.response.headers = resHeaders;

        const contentType = resHeaders['content-type'];
        if (contentType)
          networkEntry.response.mimeType = contentType.split(';')[0];
      })
    );
    this._addBarrier(
      page,
      response.serverAddr().then(server => {
        networkEntry.response.remoteIPAddress = server?.ipAddress;
        networkEntry.response.remotePort = server?.port;
      })
    );
    this._addBarrier(
      page,
      response.securityDetails().then(details => {
        if (details) networkEntry.response.securityDetails = details;
      })
    );
  }

  private async _onRequestCompleted(request: Request) {
    const networkEntry = this._findNetworkEntry(request);
    if (!networkEntry) return;

    networkEntry.loadEndTime = epochTimeInSeconds();
    // responseEnd is fired after the last byte of the response is received.
    const timing = request.timing();
    const receive =
      timing.responseEnd !== -1
        ? roundMilliSecs(timing.responseEnd - timing.responseStart)
        : -1;
    networkEntry.timings.receive = receive;
    this._calcTotalTime(networkEntry, timing);

    this._maybeAttachCertDetails(request, networkEntry);

    // For aborted/failed requests sizes will not be present
    if (timing.startTime <= 0) {
      return;
    }

    const frame = this._nullableFrameBarrier(request);
    const page = frame?.page();
    this._addBarrier(
      page,
      request.sizes().then(sizes => {
        networkEntry.request.bytes =
          sizes.requestHeadersSize + sizes.requestBodySize;
        networkEntry.request.body = {
          bytes: sizes.requestBodySize,
        };
        const transferSize = sizes.responseHeadersSize + sizes.responseBodySize;
        networkEntry.transferSize = transferSize;
        networkEntry.response.bytes = transferSize;
        networkEntry.response.body = {
          bytes: sizes.responseBodySize,
        };
      })
    );
  }

  /**
   * Navigations that fail TLS validation never produce a CDP response, so the
   * usual `response.securityDetails` path captures nothing. Recover the cert
   * from the Security domain so a `tls` block is still emitted (e.g. so the
   * browser TLS-expiry alert can fire on already-expired certs).
   */
  private _maybeAttachCertDetails(request: Request, networkEntry: NetworkInfo) {
    const failure = request.failure();
    if (
      !failure ||
      networkEntry.response.securityDetails ||
      !CERTIFICATE_ERROR.test(failure.errorText)
    ) {
      return;
    }
    const probe = this._probeCertificate(networkEntry.url).then(details => {
      if (details) networkEntry.response.securityDetails = details;
    });
    this._certProbes.add(probe);
    probe.finally(() => this._certProbes.delete(probe));
  }

  /**
   * Opens a TLS connection (without verifying the cert) purely to read the peer
   * certificate. This recovers cert details for hosts the browser refused to
   * connect to due to an invalid cert.
   */
  private _probeCertificate(
    urlString: string
  ): Promise<SecurityDetails | undefined> {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (_) {
      return Promise.resolve(undefined);
    }
    if (url.protocol !== 'https:') return Promise.resolve(undefined);

    const origin = url.origin;
    const cached = this._certProbeCache.get(origin);
    if (cached) return cached;

    const probe = new Promise<SecurityDetails | undefined>(resolve => {
      let settled = false;
      const done = (details?: SecurityDetails) => {
        if (settled) return;
        settled = true;
        resolve(details);
      };
      try {
        const socket = tlsConnect(
          {
            host: url.hostname,
            port: url.port ? Number(url.port) : 443,
            servername: url.hostname,
            rejectUnauthorized: false,
            timeout: CERT_PROBE_TIMEOUT,
          },
          () => {
            const details = toSecurityDetails(
              socket.getPeerCertificate(),
              socket.getProtocol()
            );
            socket.end();
            done(details);
          }
        );
        socket.once('error', () => {
          socket.destroy();
          done();
        });
        socket.once('timeout', () => {
          socket.destroy();
          done();
        });
      } catch (_) {
        done();
      }
    });
    this._certProbeCache.set(origin, probe);
    return probe;
  }

  /**
   * Calculates the total time for the network request based on the ResourceTiming
   * data from Playwright. Fallbacks to the event timings if ResourceTiming data
   * is not available.
   */
  private _calcTotalTime(
    entry: NetworkInfo,
    rtiming: ReturnType<Request['timing']>
  ) {
    const timings = entry.timings;
    entry.timings.total = [
      timings.blocked,
      timings.dns,
      timings.connect,
      timings.wait,
      timings.receive,
    ].reduce((pre, cur) => ((cur || -1) > 0 ? cur + pre : pre), 0);

    // fallback when ResourceTiming data is not available
    if (rtiming.startTime <= 0) {
      const end =
        entry.loadEndTime ||
        entry.responseReceivedTime ||
        entry.requestSentTime;
      const total = roundMilliSecs((end - entry.requestSentTime) * 1000);
      entry.timings.total = total <= 0 ? -1 : total;
    }
  }

  async stop() {
    /**
     * Waiting for all network events is error prone and might hang the tests
     * from getting closed forever when there are upstream bugs in browsers or
     * Playwright. So we log and drop these events once the test run is completed
     */
    if (this._barrierPromises.size > 0) {
      log(`Plugins: dropping ${this._barrierPromises.size} network events`);
    }
    // Cert probes are bounded by their own timeout, so awaiting them here is
    // safe and ensures recovered TLS details are present in the results.
    if (this._certProbes.size > 0) {
      await Promise.allSettled(this._certProbes);
    }
    const context = this.driver.context;
    context.off('request', this._onRequest.bind(this));
    context.off('response', this._onResponse.bind(this));
    context.off('requestfinished', this._onRequestCompleted.bind(this));
    context.off('requestfailed', this._onRequestCompleted.bind(this));
    this._certProbes.clear();
    this._certProbeCache.clear();
    this._barrierPromises.clear();
    log(`Plugins: stopped collecting network events`);
    return this.results;
  }
}

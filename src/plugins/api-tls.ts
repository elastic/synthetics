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

import * as tls from 'tls';
import { SecurityDetails } from '../common_types';
import { log } from '../core/logger';

export type TLSProbeResult = {
  securityDetails: SecurityDetails;
  remoteAddress?: string;
  remotePort?: number;
  /** Milliseconds, rounded to 3 decimals */
  timings: {
    dns: number;
    connect: number;
    ssl: number;
  };
};

/**
 * Playwright's APIRequestContext does not surface TLS or remote-socket
 * details (those live in the browser-only CDP path), so we open a small
 * side-channel TLS connection to the target host:port and read the peer
 * certificate. The probe is fire-and-forget from the caller's
 * perspective — it runs in parallel with the actual request and is
 * cached per host:port so subsequent requests to the same origin reuse
 * the result.
 *
 * Probe failures (DNS errors, timeouts, server hangs) are intentionally
 * silent: API monitoring keeps working with `securityDetails`
 * undefined; the cert data is purely additive.
 */
export async function probeTLS(
  host: string,
  port: number,
  timeoutMs = 5000
): Promise<TLSProbeResult | null> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (result: TLSProbeResult | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const dnsStart = Date.now();
    let dnsEnd = -1;
    let connectEnd = -1;

    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        /**
         * Do not abort the probe on untrusted/self-signed certs. We want
         * to *report* the cert details, not enforce trust here. Status
         * code assertions in the journey itself remain the source of
         * truth for whether the request "passed".
         */
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const sslEnd = Date.now();
        try {
          const cert = socket.getPeerCertificate(true);
          const protocol = normalizeProtocol(socket.getProtocol());
          settle({
            securityDetails: {
              issuer: cert?.issuer?.CN,
              subjectName: cert?.subject?.CN,
              protocol,
              validFrom: parseCertEpoch(cert?.valid_from),
              validTo: parseCertEpoch(cert?.valid_to),
            },
            remoteAddress: socket.remoteAddress,
            remotePort: socket.remotePort,
            timings: {
              dns: dnsEnd > 0 ? round(dnsEnd - dnsStart) : -1,
              connect:
                connectEnd > 0 && dnsEnd > 0
                  ? round(connectEnd - dnsEnd)
                  : -1,
              ssl: connectEnd > 0 ? round(sslEnd - connectEnd) : -1,
            },
          });
        } catch (e) {
          log(`TLS probe failed for ${host}:${port}: ${e?.message ?? e}`);
          settle(null);
        } finally {
          socket.end();
        }
      }
    );

    socket.on('lookup', () => {
      dnsEnd = Date.now();
    });
    socket.on('connect', () => {
      connectEnd = Date.now();
    });
    socket.on('timeout', () => {
      log(`TLS probe timed out after ${timeoutMs}ms for ${host}:${port}`);
      socket.destroy();
      settle(null);
    });
    socket.on('error', err => {
      log(`TLS probe error for ${host}:${port}: ${err.message}`);
      settle(null);
    });
  });
}

function round(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}

/**
 * Node's `socket.getProtocol()` returns strings like `"TLSv1.3"`. The
 * existing `formatTLS()` in the JSON reporter splits on a space, so we
 * normalize to the same shape the browser path emits, e.g. `"TLS 1.3"`.
 */
function normalizeProtocol(raw: string | null): string | undefined {
  if (!raw) return undefined;
  // "TLSv1.3" → "TLS 1.3", "SSLv3" → "SSL 3", "TLS 1.2" → "TLS 1.2"
  const normalized = raw.replace(/\s*v(?=\d)/i, ' ').replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ');
  if (parts.length < 2) return normalized;
  return `${parts[0].toUpperCase()} ${parts.slice(1).join(' ')}`;
}

/**
 * Certificate dates come from Node as strings like
 * `"Apr 23 00:00:00 2025 GMT"`. Heartbeat ingestion expects an epoch in
 * seconds (the existing reporter multiplies by 1000 to build a Date).
 */
function parseCertEpoch(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

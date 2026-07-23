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

import { SpanContext, TraceFlags } from '@opentelemetry/api';

const TRACEPARENT_RE =
  /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

type DistributedTraceCarrier = {
  traceparent: string;
  tracestate?: string;
};

let activeCarrier: DistributedTraceCarrier | undefined;

export function setActiveDistributedTraceCarrier(context?: SpanContext): void {
  if (!context) {
    activeCarrier = undefined;
    return;
  }

  activeCarrier = {
    traceparent: `00-${context.traceId}-${context.spanId}-${toTraceFlagsHex(
      context.traceFlags
    )}`,
    tracestate: context.traceState?.serialize(),
  };
}

export function clearActiveDistributedTraceCarrier(): void {
  activeCarrier = undefined;
}

export function getActiveDistributedTraceCarrier():
  | DistributedTraceCarrier
  | undefined {
  return activeCarrier;
}

function toTraceFlagsHex(flags?: TraceFlags): string {
  const value = flags ?? TraceFlags.SAMPLED;
  return value.toString(16).padStart(2, '0');
}

export function getHeaderIgnoreCase(
  headers: Record<string, string> | undefined,
  key: string
): string | undefined {
  if (!headers) {
    return;
  }
  const lowered = key.toLowerCase();
  for (const [candidate, value] of Object.entries(headers)) {
    if (candidate.toLowerCase() === lowered) {
      return value;
    }
  }
}

export function hasTraceparentHeader(
  headers: Record<string, string> | undefined
): boolean {
  return !!getHeaderIgnoreCase(headers, 'traceparent');
}

export function tryInjectDistributedTracingHeaders(headers: {
  [key: string]: string;
}): boolean {
  if (!headers || hasTraceparentHeader(headers)) {
    return false;
  }

  const carrier = getActiveDistributedTraceCarrier();
  if (!carrier?.traceparent) {
    return false;
  }

  headers['traceparent'] = carrier.traceparent;
  if (carrier.tracestate) {
    headers['tracestate'] = carrier.tracestate;
  }
  return true;
}

export function isTracingAllowedForUrl(
  rawUrl: string,
  allowedOrigins: string[] = []
): boolean {
  if (!rawUrl || allowedOrigins.length === 0) {
    return false;
  }

  let host = '';
  let protocol = '';
  try {
    const url = new URL(rawUrl);
    host = url.hostname.toLowerCase();
    protocol = url.protocol;
  } catch {
    return false;
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    return false;
  }

  return allowedOrigins.some(pattern => hostMatchesPattern(host, pattern));
}

function hostMatchesPattern(host: string, rawPattern: string): boolean {
  const pattern = (rawPattern || '').trim().toLowerCase();
  if (!pattern) {
    return false;
  }

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === pattern;
}

export function parseTraceparent(
  traceparent: string | undefined
): SpanContext | undefined {
  if (!traceparent) {
    return;
  }

  const match = traceparent.trim().match(TRACEPARENT_RE);
  if (!match) {
    return;
  }

  const [, version, traceId, spanId, flagsHex] = match;
  // Reject explicitly invalid version ff.
  if (version.toLowerCase() === 'ff') {
    return;
  }

  const traceFlags = parseInt(flagsHex, 16) & TraceFlags.SAMPLED;
  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags,
    isRemote: true,
  };
}

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

import { TraceFlags } from '@opentelemetry/api';
import {
  clearActiveDistributedTraceCarrier,
  getActiveDistributedTraceCarrier,
  getHeaderIgnoreCase,
  hasTraceparentHeader,
  isTracingAllowedForUrl,
  parseTraceparent,
  setActiveDistributedTraceCarrier,
  tryInjectDistributedTracingHeaders,
} from '../../src/core/distributed-tracing';

describe('distributed_tracing', () => {
  afterEach(() => {
    clearActiveDistributedTraceCarrier();
  });

  it('sets and clears active distributed tracing carrier', () => {
    setActiveDistributedTraceCarrier({
      traceId: '70f5f7e91d4f6f04636f27e72f33818d',
      spanId: '58dfc2a7bc56cd91',
      traceFlags: TraceFlags.SAMPLED,
      traceState: {
        serialize: () => 'es=s:1',
      } as any,
    });

    expect(getActiveDistributedTraceCarrier()).toEqual({
      traceparent: '00-70f5f7e91d4f6f04636f27e72f33818d-58dfc2a7bc56cd91-01',
      tracestate: 'es=s:1',
    });

    clearActiveDistributedTraceCarrier();
    expect(getActiveDistributedTraceCarrier()).toBeUndefined();
  });

  it('finds headers case-insensitively', () => {
    const headers = {
      'X-Request-ID': 'req-1',
      TraceParent: '00-70f5f7e91d4f6f04636f27e72f33818d-58dfc2a7bc56cd91-01',
    };

    expect(getHeaderIgnoreCase(headers, 'x-request-id')).toBe('req-1');
    expect(getHeaderIgnoreCase(headers, 'traceparent')).toBe(
      '00-70f5f7e91d4f6f04636f27e72f33818d-58dfc2a7bc56cd91-01'
    );
    expect(hasTraceparentHeader(headers)).toBe(true);
  });

  it('injects distributed tracing headers only when traceparent is absent', () => {
    const noCarrierHeaders: Record<string, string> = {
      accept: 'application/json',
    };

    expect(tryInjectDistributedTracingHeaders(noCarrierHeaders)).toBe(false);
    expect(noCarrierHeaders).toEqual({ accept: 'application/json' });

    setActiveDistributedTraceCarrier({
      traceId: '70f5f7e91d4f6f04636f27e72f33818d',
      spanId: '58dfc2a7bc56cd91',
      traceFlags: TraceFlags.SAMPLED,
      traceState: {
        serialize: () => 'es=s:1',
      } as any,
    });

    const existing = {
      TraceParent: '00-11111111111111111111111111111111-2222222222222222-01',
    };

    expect(tryInjectDistributedTracingHeaders(existing)).toBe(false);
    expect(existing.TraceParent).toBe(
      '00-11111111111111111111111111111111-2222222222222222-01'
    );

    const headers: Record<string, string> = { accept: 'application/json' };
    expect(tryInjectDistributedTracingHeaders(headers)).toBe(true);
    expect(headers.traceparent).toBe(
      '00-70f5f7e91d4f6f04636f27e72f33818d-58dfc2a7bc56cd91-01'
    );
    expect(headers.tracestate).toBe('es=s:1');
  });

  it('matches exact and wildcard tracing host rules', () => {
    expect(
      isTracingAllowedForUrl('https://api.example.com/path', ['*.example.com'])
    ).toBe(true);
    expect(
      isTracingAllowedForUrl('https://example.com/path', ['example.com'])
    ).toBe(true);
    expect(
      isTracingAllowedForUrl('https://elastic.co/path', ['example.com'])
    ).toBe(false);
  });

  it('rejects invalid schemes and malformed URLs', () => {
    expect(
      isTracingAllowedForUrl('data:text/plain,hello', ['example.com'])
    ).toBe(false);
    expect(isTracingAllowedForUrl('notaurl', ['example.com'])).toBe(false);
    expect(isTracingAllowedForUrl('https://example.com', [])).toBe(false);
  });

  it('parses traceparent and rejects malformed values', () => {
    expect(
      parseTraceparent(
        '00-70F5F7E91D4F6F04636F27E72F33818D-58DFC2A7BC56CD91-01'
      )
    ).toEqual({
      traceId: '70f5f7e91d4f6f04636f27e72f33818d',
      spanId: '58dfc2a7bc56cd91',
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });

    expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
    expect(
      parseTraceparent(
        'ff-70f5f7e91d4f6f04636f27e72f33818d-58dfc2a7bc56cd91-01'
      )
    ).toBeUndefined();
  });
});

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

jest.mock('@opentelemetry/api', () => ({
  SpanStatusCode: { UNSET: 0, OK: 1, ERROR: 2 },
  context: {
    active: jest.fn(() => ({})),
  },
  trace: {
    setSpan: jest.fn((_ctx: unknown, span: unknown) => ({ parentSpan: span })),
    setSpanContext: jest.fn((_ctx: unknown, spanContext: unknown) => ({
      parentSpanContext: spanContext,
    })),
  },
}));

jest.mock('../../src/core/otel', () => ({
  createOTelRuntime: jest.fn(),
  setOTelStatusFromError: jest.fn(),
  shutdownOTel: jest.fn(() => Promise.resolve()),
  flushOTel: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/core/distributed-tracing', () => ({
  setActiveDistributedTraceCarrier: jest.fn(),
  clearActiveDistributedTraceCarrier: jest.fn(),
  getHeaderIgnoreCase: jest.fn(
    (headers: Record<string, string> | undefined, key: string) => {
      if (!headers) {
        return;
      }
      const lowered = key.toLowerCase();
      for (const [candidate, value] of Object.entries(headers)) {
        if (candidate.toLowerCase() === lowered) {
          return value;
        }
      }
      return;
    }
  ),
  parseTraceparent: jest.fn(),
}));

import { OTelPlugin } from '../../src/plugins/otel';
import {
  createOTelRuntime,
  flushOTel,
  setOTelStatusFromError,
  shutdownOTel,
} from '../../src/core/otel';
import {
  clearActiveDistributedTraceCarrier,
  parseTraceparent,
  setActiveDistributedTraceCarrier,
} from '../../src/core/distributed-tracing';

type SpanStub = {
  setAttribute: (...args: any[]) => any;
  addEvent: (...args: any[]) => any;
  setStatus: (...args: any[]) => any;
  end: (...args: any[]) => any;
  spanContext: (...args: any[]) => any;
};

function makeSpanContext(traceId: string, spanId: string) {
  return {
    traceId,
    spanId,
    traceFlags: 1,
  };
}

function makeSpan(
  context = makeSpanContext(
    '70f5f7e91d4f6f04636f27e72f33818d',
    '58dfc2a7bc56cd91'
  )
): SpanStub {
  return {
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
    spanContext: jest.fn(() => context),
  };
}

function makeJourney(overrides: Record<string, unknown> = {}) {
  return {
    id: 'j-1',
    name: 'journey-1',
    type: 'browser',
    status: 'succeeded',
    duration: 1,
    ...overrides,
  } as any;
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    name: 'step-1',
    index: 1,
    duration: 0.1,
    url: 'https://example.com',
    soft: false,
    ...overrides,
  } as any;
}

describe('OTelPlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates journey and step spans and updates distributed trace carrier', () => {
    const rootSpan = makeSpan(
      makeSpanContext('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb')
    );
    const stepSpan = makeSpan(
      makeSpanContext('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccc')
    );
    const tracer = {
      startSpan: jest
        .fn()
        .mockReturnValueOnce(rootSpan)
        .mockReturnValueOnce(stepSpan),
    };

    (createOTelRuntime as any).mockReturnValue({ tracer });

    const plugin = new OTelPlugin(true, true);
    const journey = makeJourney();
    const step = makeStep();

    plugin.onJourneyStart(journey);
    plugin.startStepSpanLifecycle(journey, step);

    expect(tracer.startSpan).toHaveBeenCalledTimes(2);
    expect(setActiveDistributedTraceCarrier).toHaveBeenNthCalledWith(
      1,
      rootSpan.spanContext()
    );
    expect(setActiveDistributedTraceCarrier).toHaveBeenNthCalledWith(
      2,
      stepSpan.spanContext()
    );
  });

  it('ends journey span, sets status and clears distributed trace carrier', () => {
    const rootSpan = makeSpan();
    const tracer = {
      startSpan: jest.fn().mockReturnValue(rootSpan),
    };
    (createOTelRuntime as any).mockReturnValue({ tracer });

    const plugin = new OTelPlugin(true, true);
    const journey = makeJourney({ status: 'failed', duration: 2 });
    const error = new Error('boom');

    plugin.onJourneyStart(journey);
    plugin.onJourneyEnd(journey, error);

    expect(setOTelStatusFromError).toHaveBeenCalledWith(rootSpan, error);
    expect(rootSpan.end).toHaveBeenCalled();
    expect(clearActiveDistributedTraceCarrier).toHaveBeenCalled();
  });

  it('records a network span with remote link and http error status', () => {
    const rootSpan = makeSpan(
      makeSpanContext('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb')
    );
    const stepSpan = makeSpan(
      makeSpanContext('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccc')
    );
    const requestSpan = makeSpan();

    const tracer = {
      startSpan: jest
        .fn()
        .mockReturnValueOnce(rootSpan)
        .mockReturnValueOnce(stepSpan)
        .mockReturnValueOnce(requestSpan),
    };

    (createOTelRuntime as any).mockReturnValue({ tracer });
    (parseTraceparent as any).mockReturnValue({
      traceId: 'dddddddddddddddddddddddddddddddd',
      spanId: 'eeeeeeeeeeeeeeee',
      traceFlags: 1,
      isRemote: true,
    });

    const plugin = new OTelPlugin(true, false);
    const journey = makeJourney();
    const step = makeStep({ index: 2 });

    plugin.onJourneyStart(journey);
    plugin.startStepSpanLifecycle(journey, step);
    plugin.endStepSpanWithError(journey, step, null);

    plugin.recordNetworkSpan(journey, {
      request: {
        method: 'POST',
        headers: {
          traceparent:
            '00-dddddddddddddddddddddddddddddddd-eeeeeeeeeeeeeeee-01',
        },
      },
      response: { status: 500 },
      type: 'xhr',
      step,
      url: 'https://api.example.com/items',
      requestSentTime: 1710000000,
      loadEndTime: 1710000001,
    } as any);

    expect(tracer.startSpan).toHaveBeenCalledTimes(3);
    expect(requestSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'HTTP 500',
    });
    expect(requestSpan.end).toHaveBeenCalled();
  });

  it('catches and logs exporter shutdown and flush errors', async () => {
    (createOTelRuntime as any).mockReturnValue({
      tracer: { startSpan: jest.fn() },
    });
    (shutdownOTel as any).mockRejectedValueOnce(new Error('shutdown failed'));
    (flushOTel as any).mockRejectedValueOnce(new Error('flush failed'));

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const plugin = new OTelPlugin(true, false);
    await plugin.shutdown();
    await plugin.flush();

    expect(errorSpy).toHaveBeenCalledWith(
      '[otel] failed to shutdown exporter: shutdown failed'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[otel] failed to flush spans: flush failed'
    );

    errorSpy.mockRestore();
  });

  it('is no-op when runtime is disabled', () => {
    (createOTelRuntime as any).mockReturnValue(undefined);

    const plugin = new OTelPlugin(false, true);
    const journey = makeJourney();
    const step = makeStep();

    expect(() => plugin.onJourneyStart(journey)).not.toThrow();
    expect(() => plugin.startStepSpanLifecycle(journey, step)).not.toThrow();
    expect(() => plugin.onJourneyEnd(journey)).not.toThrow();
  });
});

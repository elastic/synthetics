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

import { Span, SpanStatusCode, context, trace } from '@opentelemetry/api';
import { Journey, Step } from '../dsl';
import { NetworkInfo } from '../common_types';
import {
  createOTelRuntime,
  OTelRuntime,
  setOTelStatusFromError,
  shutdownOTel,
  flushOTel,
  OTelJourneyTrace,
} from '../core/otel';
import {
  clearActiveDistributedTraceCarrier,
  getHeaderIgnoreCase,
  parseTraceparent,
  setActiveDistributedTraceCarrier,
} from '../core/distributed-tracing';
import { getDurationInUs } from '../helpers';

export interface SyntheticPlugin {
  start?(): Promise<void>;
  stop?(): Promise<void>;
  onJourneyStart?(journey: Journey): void;
  onJourneyEnd?(journey: Journey, error?: Error | null): void;
  onStep?(step: Step): void;
}

export class OTelPlugin implements SyntheticPlugin {
  private otelRuntime: OTelRuntime | undefined = undefined;
  private traces = new Map<string, OTelJourneyTrace>();
  private distributedTracingEnabled = false;

  constructor(enabled: boolean, distributedTracingEnabled = false) {
    this.otelRuntime = createOTelRuntime(enabled);
    this.distributedTracingEnabled = distributedTracingEnabled;
  }

  private journeyKey(journey: Journey) {
    return journey.id || journey.name;
  }

  private addSafeEvent(
    span: Span | undefined,
    name: string,
    attrs?: Record<string, string | number | boolean | undefined>
  ) {
    if (!span) {
      return;
    }

    const filteredAttrs = Object.entries(attrs || {}).reduce((acc, entry) => {
      const [key, value] = entry;
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    try {
      span.addEvent(name, filteredAttrs);
    } catch (_) {
      // OpenTelemetry export should be best effort.
    }
  }

  private truncate(value: string, max = 4096) {
    if (!value || value.length <= max) {
      return value;
    }
    return value.slice(0, max);
  }

  private setSafeAttributes(
    span: Span | undefined,
    attrs: Record<string, string | number | boolean | undefined>
  ) {
    if (!span) {
      return;
    }
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) {
        continue;
      }
      try {
        span.setAttribute(key, value);
      } catch (_) {
        // OpenTelemetry export should be best effort.
      }
    }
  }

  private toSpanTime(seconds?: number): Date | undefined {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    return new Date(seconds * 1000);
  }

  private createJourneyTrace(journey: Journey) {
    if (!this.otelRuntime) {
      return;
    }

    const rootSpan = this.otelRuntime.tracer.startSpan(
      this.journeyKey(journey)
    );
    if (this.distributedTracingEnabled) {
      setActiveDistributedTraceCarrier(rootSpan.spanContext());
    }
    this.setSafeAttributes(rootSpan, {
      'synthetics.journey.name': journey.name,
      'synthetics.journey.id': journey.id,
      'synthetics.journey.type': journey.type,
      'span.type': 'elastic-synthetics',
      'span.subtype': 'journey',
    });
    this.traces.set(this.journeyKey(journey), {
      rootSpan,
      steps: new Map<number, Span>(),
      stepContexts: new Map(),
    });
  }

  private endJourneyTrace(journey: Journey) {
    const traceState = this.traces.get(this.journeyKey(journey));
    if (!traceState) {
      return;
    }

    setOTelStatusFromError(traceState.rootSpan, journey.error);
    this.setSafeAttributes(traceState.rootSpan, {
      'synthetics.journey.status': journey.status,
      'synthetics.journey.duration.us': getDurationInUs(journey.duration),
    });
    traceState.rootSpan.end();
    this.traces.delete(this.journeyKey(journey));
    if (this.distributedTracingEnabled) {
      clearActiveDistributedTraceCarrier();
    }
  }

  private startStepSpan(journey: Journey, step: Step) {
    const traceState = this.traces.get(this.journeyKey(journey));
    if (!traceState || !this.otelRuntime) {
      return;
    }

    const ctx = trace.setSpan(context.active(), traceState.rootSpan);
    const span = this.otelRuntime.tracer.startSpan(step.name, undefined, ctx);
    this.setSafeAttributes(span, {
      'synthetics.step.name': step.name,
      'synthetics.step.index': step.index,
      'synthetics.step.soft': !!step.soft,
      'span.type': 'elastic-synthetics',
      'span.subtype': 'step',
    });
    if (this.distributedTracingEnabled) {
      setActiveDistributedTraceCarrier(span.spanContext());
    }
    traceState.steps.set(step.index, span);
  }

  private endStepSpan(journey: Journey, stepIndex: number) {
    const traceState = this.traces.get(this.journeyKey(journey));
    const span = traceState?.steps.get(stepIndex);
    if (!span || !traceState) {
      return;
    }

    traceState.stepContexts.set(stepIndex, span.spanContext());
    span.end();
    traceState.steps.delete(stepIndex);
    if (this.distributedTracingEnabled) {
      setActiveDistributedTraceCarrier(traceState.rootSpan.spanContext());
    }
  }

  recordNetworkSpan(journey: Journey, ni: NetworkInfo) {
    if (!this.otelRuntime) {
      return;
    }

    const traceState = this.traces.get(this.journeyKey(journey));
    if (!traceState) {
      return;
    }

    const parentStepContext =
      ni.step?.index != null
        ? traceState.stepContexts.get(ni.step.index)
        : undefined;
    const requestHeaders = ni.request?.headers;
    const remoteContext = parseTraceparent(
      getHeaderIgnoreCase(requestHeaders, 'traceparent')
    );

    const spanName = `http ${ni.request?.method || 'GET'} ${
      ni.type || 'request'
    }`;
    const startTime = this.toSpanTime(ni.requestSentTime);
    const endTime =
      this.toSpanTime(ni.loadEndTime) ||
      this.toSpanTime(ni.responseReceivedTime);

    try {
      const ctx = parentStepContext
        ? trace.setSpanContext(context.active(), parentStepContext)
        : trace.setSpan(context.active(), traceState.rootSpan);
      const parentContext =
        parentStepContext || traceState.rootSpan.spanContext();
      const links =
        remoteContext &&
        (remoteContext.traceId !== parentContext.traceId ||
          remoteContext.spanId !== parentContext.spanId)
          ? [{ context: remoteContext }]
          : undefined;
      const requestSpan = this.otelRuntime.tracer.startSpan(
        spanName,
        startTime ? { startTime, links } : { links },
        ctx
      );

      this.setSafeAttributes(requestSpan, {
        'http.request.method': ni.request?.method,
        'url.full': this.truncate(ni.url),
        'http.response.status_code': ni.response?.status,
        'network.transfer_size': ni.transferSize,
        'network.resource_size': ni.resourceSize,
        'synthetics.network.type': ni.type,
        'synthetics.network.is_navigation': ni.isNavigationRequest,
        'synthetics.network.timings.wait_ms': ni.timings?.wait,
        'synthetics.network.timings.receive_ms': ni.timings?.receive,
        'synthetics.network.timings.total_ms': ni.timings?.total,
      });

      if (ni.response?.status >= 400) {
        requestSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${ni.response.status}`,
        });
      } else {
        requestSpan.setStatus({ code: SpanStatusCode.OK });
      }

      if (endTime) {
        requestSpan.end(endTime);
      } else {
        requestSpan.end();
      }
    } catch (_) {
      // OpenTelemetry export should be best effort.
    }
  }

  onJourneyStart(journey: Journey): void {
    this.createJourneyTrace(journey);
  }

  onJourneyEnd(journey: Journey, error?: Error | null): void {
    // Update journey with error before ending trace
    if (error) {
      journey.error = error;
    }
    this.endJourneyTrace(journey);
  }

  startStepSpanLifecycle(journey: Journey, step: Step): void {
    this.startStepSpan(journey, step);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStep(step: Step): void {
    // Legacy: step handling without journey context
    // Use startStepSpanLifecycle instead for full lifecycle
  }

  async start(): Promise<void> {
    // No initialization needed for OTEL plugin
  }

  async stop(): Promise<void> {
    // OTEL shutdown is handled in reporter's onEnd
    // This is called when the journey completes
  }

  async shutdown(): Promise<void> {
    await shutdownOTel(this.otelRuntime).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[otel] failed to shutdown exporter: ${message}`);
    });
  }

  async flush(): Promise<void> {
    await flushOTel(this.otelRuntime).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[otel] failed to flush spans: ${message}`);
    });
  }

  /**
   * Public methods for reporters to query plugin state
   */

  getActiveSpanContext() {
    // This would return the current span context for distributed tracing
    // Distributed tracing uses the carrier state functions directly
    return undefined;
  }

  setStepSpanAttributes(
    journey: Journey,
    stepIndex: number,
    attrs: Record<string, string | number | boolean | undefined>
  ) {
    const traceState = this.traces.get(this.journeyKey(journey));
    const span = traceState?.steps.get(stepIndex);
    this.setSafeAttributes(span, attrs);
  }

  addStepSpanEvent(
    journey: Journey,
    stepIndex: number,
    name: string,
    attrs?: Record<string, string | number | boolean | undefined>
  ) {
    const traceState = this.traces.get(this.journeyKey(journey));
    const span = traceState?.steps.get(stepIndex);
    this.addSafeEvent(span, name, attrs);
  }

  endStepSpanWithError(journey: Journey, step: Step, error?: Error | null) {
    const traceState = this.traces.get(this.journeyKey(journey));
    const span = traceState?.steps.get(step.index);
    if (span) {
      setOTelStatusFromError(span, error);
      this.setSafeAttributes(span, {
        'synthetics.step.duration.us': getDurationInUs(step.duration),
        'synthetics.step.url': this.truncate(step.url),
      });
      this.endStepSpan(journey, step.index);
    }
  }
}

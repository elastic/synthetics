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

import {
  Span,
  SpanKind,
  SpanStatusCode,
  TimeInput,
  SpanOptions,
  Attributes,
  AttributeValue,
} from '@opentelemetry/api';
import { Journey, Step } from '../dsl';
import { PerfMetrics, StepResult, TraceOutput } from '../common_types';
import { MonitorConfig } from '../dsl/monitor';
import { maskCredentialsInURL, monotonicTimeInSeconds } from '../helpers';

export const getJourneySpanOptions = (
  journey: Journey,
  startTime?: TimeInput
): SpanOptions => {
  return {
    startTime,
    kind: SpanKind.INTERNAL,
    attributes: {
      [AttributeNames.JOURNEY_ID]: journey.id,
      [AttributeNames.JOURNEY_NAME]: journey.name,
      [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
      [AttributeNames.SPAN_SUBTYPE]: 'journey',
    },
  };
};

type EndJourneySpanOptions = {
  span: Span;
  journey: Journey;
  endTime?: TimeInput;
};
export const endJourneySpan = ({
  span,
  journey,
  endTime,
}: EndJourneySpanOptions) => {
  if (journey.status === 'failed') {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: journey.error?.message,
    });
  }
  span.end(endTime);
};

export const getStepSpanOptions = (
  step: Step,
  startTime?: TimeInput
): SpanOptions => {
  return {
    startTime,
    kind: SpanKind.INTERNAL,
    attributes: {
      [AttributeNames.STEP_NAME]: step.name,
      [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
      [AttributeNames.SPAN_SUBTYPE]: 'step',
    },
  };
};

type EndStepSpanOptions = {
  span: Span;
  step: Step;
  data?: StepResult;
  endTime?: TimeInput;
};
export const endStepSpan = ({
  span,
  step,
  data,
  endTime,
}: EndStepSpanOptions) => {
  span.setAttributes({
    // Use STEP_URL instead of ATTR_URL_FULL to make APM page not think of step as depencency
    [AttributeNames.STEP_URL]: maskCredentialsInURL(step.url),
  });

  if (step.status === 'failed') {
    span.setStatus({
      code: SpanStatusCode.ERROR,
    });
    step.error && span.recordException(step.error);
  }
  data?.metrics && addMetricAttributesToSpan(span, data.metrics);
  data?.traces && addTracesEventsToSpan(span, data.traces);
  span.end(endTime);
};

const addMetricAttributesToSpan = (span: Span, metrics: PerfMetrics) => {
  const metricAttributes = attributesFromObject(metrics, (key, value) => [
    metricAttribute(key),
    typeof value !== 'number' ? value.us : value,
  ]);
  span.setAttributes(metricAttributes);
};

const attributesFromObject = <T extends Record<keyof T, T[keyof T]>>(
  obj: T,
  mapper: (key: keyof T, value: T[keyof T]) => [string, AttributeValue]
): Attributes => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) =>
      mapper(key as keyof T, value as T[keyof T])
    )
  );
};

const addTracesEventsToSpan = (span: Span, traces: TraceOutput[]) => {
  for (const traceData of traces) {
    const eventSecondsBeforeNow =
      monotonicTimeInSeconds() - traceData.start.us / 1e6;
    const eventTimestamp = new Date(
      Date.now() - Math.round(eventSecondsBeforeNow * 1000)
    );
    span.addEvent(traceData.name, eventTimestamp);
  }
};

export const addMonitorConfigAttributesToSpan = (
  span: Span,
  config: MonitorConfig
) => {
  const fieldAttributes = attributesFromObject(
    config.fields ?? {},
    (key, value) => [fieldAttribute(key), value]
  );
  span.setAttributes({
    ...fieldAttributes,
    [AttributeNames.JOURNEY_TAGS]: config.tags,
  });
};

const metricAttribute = (metric: string) =>
  `synthetics.journey.step.metric.${metric}`;

const fieldAttribute = (fieldName: string) =>
  `synthetics.journey.field.${fieldName}`;

export enum AttributeNames {
  JOURNEY_ID = 'synthetics.journey.id',
  JOURNEY_NAME = 'synthetics.journey.name',
  JOURNEY_TAGS = 'synthetics.journey.tags',
  STEP_NAME = 'synthetics.step.name',
  STEP_URL = 'synthetics.step.url',
  SPAN_SUBTYPE = 'span.subtype',
  SPAN_TYPE = 'span.type',
}

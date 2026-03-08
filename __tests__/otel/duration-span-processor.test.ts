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

import { HrTime, metrics, SpanStatusCode } from '@opentelemetry/api';
import { AttributeNames, DurationSpanProcessor } from '../../src/otel';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_URL_FULL,
  METRIC_HTTP_CLIENT_REQUEST_DURATION,
} from '@opentelemetry/semantic-conventions';

const commonAttributes = {
  [AttributeNames.JOURNEY_ID]: 'journey-id',
  [AttributeNames.JOURNEY_NAME]: 'journey name',
  [AttributeNames.STEP_NAME]: 'step name',
};
const createSpan = (
  attributes: Record<string, any> = {},
  duration: HrTime = [0, 0.1 * 1e9],
  code: SpanStatusCode = SpanStatusCode.UNSET
): ReadableSpan => {
  const span: Partial<ReadableSpan> = {
    duration,
    status: { code },
    attributes: {
      ...commonAttributes,
      ...attributes,
      'extra.attribute': 'extra attribute value',
    },
  };
  return span as ReadableSpan;
};

describe('DurationSpanProcessor', () => {
  let records: [number, Record<string, any>][];
  const mockedRecord = (duration: number, attributes: Record<string, any>) => {
    records.push([duration, attributes]);
  };
  const mockedCreateGauge = jest.fn().mockReturnValue({ record: mockedRecord });
  const mockedCreateHistogram = jest
    .fn()
    .mockReturnValue({ record: mockedRecord });

  jest.spyOn(metrics, 'getMeter').mockImplementation(
    () =>
      ({
        createGauge: mockedCreateGauge,
        createHistogram: mockedCreateHistogram,
      } as any)
  );

  beforeEach(() => {
    records = [];
  });

  it('records gauge metrics for journeys and steps', () => {
    const spans: ReadableSpan[] = [
      createSpan({ [AttributeNames.SPAN_SUBTYPE]: 'journey' }, [0, 0.5 * 1e9]),
      createSpan({ [AttributeNames.SPAN_SUBTYPE]: 'step' }),
      createSpan(
        { [AttributeNames.SPAN_SUBTYPE]: 'step' },
        [1, 0],
        SpanStatusCode.ERROR
      ),
      createSpan({ [AttributeNames.SPAN_SUBTYPE]: 'other' }),
    ];
    const spanProcessor = new DurationSpanProcessor();

    spans.forEach(span => spanProcessor.onEnd(span));

    expect(mockedCreateGauge).toBeCalledWith('synthetics.duration', {
      description: 'Duration in seconds',
      unit: 's',
    });
    expect(mockedCreateHistogram).not.toBeCalled();
    expect(records).toEqual([
      [
        0.5,
        {
          ...commonAttributes,
          'synthetics.status': 'success',
          'synthetics.type': 'journey',
        },
      ],
      [
        0.1,
        {
          ...commonAttributes,
          'synthetics.status': 'success',
          'synthetics.type': 'step',
        },
      ],
      [
        1.0,
        {
          ...commonAttributes,
          'synthetics.status': 'error',
          'synthetics.type': 'step',
        },
      ],
    ]);
  });

  it('records histogram metrics for requests', () => {
    const spans: ReadableSpan[] = [
      createSpan({ [ATTR_URL_FULL]: 'https://example.com/first' }, [
        0,
        0.5 * 1e9,
      ]),
      createSpan({
        [ATTR_URL_FULL]: 'https://example.com/second',
      }),
      createSpan({
        'span-without-url': 'value',
      }),
    ];
    const spanProcessor = new DurationSpanProcessor();

    spans.forEach(span => spanProcessor.onEnd(span));

    expect(mockedCreateGauge).not.toBeCalled();
    expect(mockedCreateHistogram).toBeCalledWith(
      METRIC_HTTP_CLIENT_REQUEST_DURATION,
      {
        description: 'Duration in seconds for HTTP server spans',
        unit: 's',
      }
    );
    expect(records).toEqual([
      [0.5, commonAttributes],
      [0.1, commonAttributes],
    ]);
  });
});

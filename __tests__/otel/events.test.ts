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

import { Span, SpanKind } from '@opentelemetry/api';
import { Journey } from '../../src/dsl';
import { noop } from '../../src/helpers';
import {
  getJourneySpanOptions,
  getStepSpanOptions,
  endJourneySpan,
  endStepSpan,
  addMonitorConfigAttributesToSpan,
  AttributeNames,
} from '../../src/otel/events';

describe('span events', () => {
  let okJourney: Journey;
  let failedJourney: Journey;

  const mockedSpan: Partial<Span> = {
    setAttribute: jest.fn(),
    setAttributes: jest.fn(),
    addEvent: jest.fn(),
    recordException: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
  };

  beforeEach(() => {
    okJourney = new Journey(
      { name: 'journey one', id: 'journey-one-id' },
      noop
    );
    okJourney._addStep('step one', noop);
    okJourney._addStep('step two', noop);
    okJourney.steps[0].status = 'succeeded';
    okJourney.steps[0].url = 'https://example.com';
    okJourney.steps[1].status = 'succeeded';
    okJourney.steps[1].url = 'https://example.com';
    okJourney.status = 'succeeded';

    failedJourney = new Journey(
      { name: 'journey two', id: 'journey-two-id' },
      noop
    );
    failedJourney._addStep('step one', noop);
    failedJourney._addStep('step two', noop);
    failedJourney.steps[0].status = 'succeeded';
    failedJourney.steps[0].url = 'https://example.com';
    failedJourney.steps[1].status = 'failed';
    failedJourney.steps[1].url = 'https://example.com';
    failedJourney.steps[1].error = new Error('step two failed');
    failedJourney.status = 'failed';
    failedJourney.error = new Error('step two failed');
  });

  it('extracts journey span options', () => {
    const options = [
      getJourneySpanOptions(okJourney),
      getJourneySpanOptions(failedJourney, 123),
    ];

    expect(options).toEqual([
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          [AttributeNames.JOURNEY_ID]: 'journey-one-id',
          [AttributeNames.JOURNEY_NAME]: 'journey one',
          [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
          [AttributeNames.SPAN_SUBTYPE]: 'journey',
        },
      },
      {
        startTime: 123,
        kind: SpanKind.INTERNAL,
        attributes: {
          [AttributeNames.JOURNEY_ID]: 'journey-two-id',
          [AttributeNames.JOURNEY_NAME]: 'journey two',
          [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
          [AttributeNames.SPAN_SUBTYPE]: 'journey',
        },
      },
    ]);
  });

  it('extracts step span options', () => {
    const options = [
      getStepSpanOptions(okJourney.steps[0]),
      getStepSpanOptions(okJourney.steps[1], 123),
    ];

    expect(options).toEqual([
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          [AttributeNames.STEP_NAME]: 'step one',
          [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
          [AttributeNames.SPAN_SUBTYPE]: 'step',
        },
      },
      {
        startTime: 123,
        kind: SpanKind.INTERNAL,
        attributes: {
          [AttributeNames.STEP_NAME]: 'step two',
          [AttributeNames.SPAN_TYPE]: 'elastic-synthetics',
          [AttributeNames.SPAN_SUBTYPE]: 'step',
        },
      },
    ]);
  });

  it('ends journey span when succeeded', () => {
    endJourneySpan({
      span: mockedSpan as Span,
      journey: okJourney,
      endTime: 123,
    });

    expect(mockedSpan.setStatus).not.toHaveBeenCalled();
    expect(mockedSpan.end).toHaveBeenCalledWith(123);
  });

  it('records error when journey failed', () => {
    endJourneySpan({ span: mockedSpan as Span, journey: failedJourney });

    expect(mockedSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: 'step two failed',
    });
    expect(mockedSpan.end).toHaveBeenCalled();
  });

  it('ends step span when succeeded', () => {
    const step = failedJourney.steps[0];
    endStepSpan({
      span: mockedSpan as Span,
      step,
      endTime: 123,
    });

    expect(mockedSpan.setAttributes).toHaveBeenCalledWith({
      [AttributeNames.STEP_URL]: 'https://example.com/',
    });
    expect(mockedSpan.setStatus).not.toHaveBeenCalled();
    expect(mockedSpan.end).toHaveBeenCalledWith(123);
  });

  it('records error when step failed', () => {
    const step = failedJourney.steps[1];
    endStepSpan({
      span: mockedSpan as Span,
      step,
      data: {},
    });

    expect(mockedSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
    });
    expect(mockedSpan.recordException).toHaveBeenCalledWith(step.error);
  });

  it('records error when step failed', () => {
    const step = failedJourney.steps[1];
    endStepSpan({
      span: mockedSpan as Span,
      step,
      data: {},
    });

    expect(mockedSpan.setStatus).toHaveBeenCalledWith({
      code: 2,
    });
    expect(mockedSpan.recordException).toHaveBeenCalledWith(step.error);
  });

  it('processes traces and metrics in data', () => {
    // Now is 100 seconds after process start
    jest.spyOn(process, 'hrtime').mockImplementation(() => {
      return [100, 0];
    });
    jest
      .spyOn(Date, 'now')
      .mockImplementation(() => new Date('2000-01-01T00:00:50.000Z').getTime());
    const step = failedJourney.steps[0];

    endStepSpan({
      span: mockedSpan as Span,
      step,
      data: {
        metrics: {
          fcp: { us: 1 },
          lcp: { us: 2 },
          dcl: { us: 3 },
          load: { us: 4 },
          cls: 5,
        },
        traces: [
          {
            name: 'trace one',
            type: 'trace',
            start: { us: 60000000 }, // 60 seconds after process start
          },
          {
            name: 'trace two',
            type: 'trace',
            start: { us: 70000000 }, // 70 seconds after process start
          },
        ],
      },
    });

    expect(mockedSpan.setAttributes).toHaveBeenLastCalledWith({
      'synthetics.journey.step.metric.fcp': 1,
      'synthetics.journey.step.metric.lcp': 2,
      'synthetics.journey.step.metric.dcl': 3,
      'synthetics.journey.step.metric.load': 4,
      'synthetics.journey.step.metric.cls': 5,
    });
    expect((mockedSpan.addEvent as jest.Mock).mock.calls).toEqual([
      ['trace one', new Date('2000-01-01T00:00:10.000Z')],
      ['trace two', new Date('2000-01-01T00:00:20.000Z')],
    ]);
  });

  it('sets monitor config attributes to span', () => {
    const config = {
      fields: {
        field1: 'value1',
        field2: 'value2',
      },
      tags: ['tag1', 'tag2'],
    };
    addMonitorConfigAttributesToSpan(mockedSpan as Span, config);
    expect(mockedSpan.setAttributes).toHaveBeenCalledWith({
      'synthetics.journey.field.field1': 'value1',
      'synthetics.journey.field.field2': 'value2',
      'synthetics.journey.tags': ['tag1', 'tag2'],
    });
  });
});

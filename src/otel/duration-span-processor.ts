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

import { Attributes, metrics } from '@opentelemetry/api';
import { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  ATTR_URL_FULL,
  METRIC_HTTP_CLIENT_REQUEST_DURATION,
} from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './';
import { getPackageInfo } from '../helpers';

const { name, version } = getPackageInfo();

export class DurationSpanProcessor implements SpanProcessor {
  constructor() {}

  onStart() {}

  onEnd(span: ReadableSpan) {
    const meter = metrics.getMeter(name, version);
    const subtype = span.attributes[AttributeNames.SPAN_SUBTYPE];
    const [secs, nanos] = span.duration;
    const durationSecs = secs + nanos / 1e9;
    const attributes = this.filterAttributes(span.attributes);

    if (subtype === 'journey' || subtype === 'step') {
      const gauge = meter.createGauge(`synthetics.duration`, {
        description: 'Duration in seconds',
        unit: 's',
      });
      gauge.record(durationSecs, {
        ...attributes,
        'synthetics.status': span.status.code === 2 ? 'error' : 'success',
        'synthetics.type': subtype,
      });
    } else if (ATTR_URL_FULL in span.attributes) {
      meter
        .createHistogram(METRIC_HTTP_CLIENT_REQUEST_DURATION, {
          description: 'Duration in seconds for HTTP server spans',
          unit: 's',
        })
        .record(durationSecs, attributes);
    }
  }

  async forceFlush() {}

  async shutdown() {}

  private filterAttributes(attributes: Attributes): Attributes {
    const attributesToKeep = [
      AttributeNames.JOURNEY_ID,
      AttributeNames.JOURNEY_NAME,
      AttributeNames.STEP_NAME,
    ];
    const attributesToAdd = Object.entries(attributes).filter(([key]) =>
      attributesToKeep.includes(key as AttributeNames)
    );
    return Object.fromEntries(attributesToAdd);
  }
}

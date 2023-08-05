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

import { Request, Route } from 'playwright-core';
import { ApmOptions, Driver } from '../common_types';
import { runner } from '../core';
import { Journey } from '../dsl';

/**
 * Baggage header is used to propagate user defined properties across distributed systems.
 * https://www.w3.org/TR/baggage/
 */
export const BAGGAGE_HEADER = 'baggage';
/**
 * Tracestate header is used to provide vendor specific trace identification.
 * https://www.w3.org/TR/trace-context/#tracestate-header
 */
export const TRACE_STATE_HEADER = 'tracestate';
const NAMESPACE = 'es';
const PROPERTY_SEPARATOR = '=';

function getValueFromEnv(key: string) {
  return process.env?.[key];
}

/**
 * Generate the tracestate header in the elastic namespace which is understood by
 * all of our apm agents
 * https://github.com/elastic/apm/blob/main/specs/agents/tracing-distributed-tracing.md#tracestate
 *
 * rate must be in the range [0,1] rounded up to 4 decimal precision (0.0001, 0.8122, )
 */
export function genTraceStateHeader(rate = 1) {
  if (isNaN(rate) || rate < 0 || rate > 1) {
    rate = 1;
  } else if (rate > 0 && rate < 0.001) {
    rate = 0.001;
  } else {
    rate = Math.round(rate * 10000) / 10000;
  }
  return `${NAMESPACE}${PROPERTY_SEPARATOR}s:${rate}`;
}

/**
 * Generate the baggage header to be propagated to the destination routes
 *
 * We are interested in the following properties
 * 1. Monitor ID - monitor id of the synthetics monitor
 * 2. Trace id - checkgroup/exec that begins the synthetics journey
 * 3. Location - location where the synthetics monitor is run from
 * 4. Type - type of the synthetics monitor (browser, http, tcp, etc)
 */
export function generateBaggageHeader(journey: Journey) {
  let monitorId = getValueFromEnv('ELASTIC_SYNTHETICS_MONITOR_ID');
  if (!monitorId) {
    monitorId = journey?.monitor.config.id;
  }

  const baggageObj = {
    'synthetics.trace.id': getValueFromEnv('ELASTIC_SYNTHETICS_TRACE_ID'),
    'synthetics.monitor.id': monitorId,
    'synthetics.monitor.type': getValueFromEnv(
      'ELASTIC_SYNTHETICS_MONITOR_TYPE'
    ),
    'synthetics.monitor.location': getValueFromEnv(
      'ELASTIC_SYNTHETICS_MONITOR_LOCATION'
    ),
  };

  let baggage = '';
  for (const key of Object.keys(baggageObj)) {
    if (baggageObj[key]) {
      baggage += `${key}${PROPERTY_SEPARATOR}${baggageObj[key]};`;
    }
  }

  return baggage;
}

export class Apm {
  constructor(private driver: Driver, private options: ApmOptions) {}

  async traceHandler(route: Route, request: Request) {
    // Propagate baggae headers to the urls
    route.continue({
      headers: {
        ...request.headers(),
        [BAGGAGE_HEADER]: generateBaggageHeader(runner.currentJourney),
        [TRACE_STATE_HEADER]: genTraceStateHeader(this.options.sampleRate),
      },
    });
  }

  async start() {
    for (const url of this.options.traceUrls) {
      await this.driver.context.route(url, this.traceHandler.bind(this));
    }
  }

  async stop() {
    for (const url of this.options.traceUrls) {
      await this.driver.context.unroute(url, this.traceHandler.bind(this));
    }
  }
}

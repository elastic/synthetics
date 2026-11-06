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
import { runner } from '../core/globals';
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
const MIN_SAMPLE_RATE = 0.0001;
const PROPERTY_SEPARATOR = '=';
// W3C baggage separates list members with ',' (';' is reserved for per-member
// properties), so a single member with ';'-joined pairs would collapse to the
// first key on spec-compliant parsers. https://www.w3.org/TR/baggage/
const MEMBER_SEPARATOR = ',';

function getValueFromEnv(key: string) {
  return process.env?.[key];
}

/**
 * Generate the tracestate header in the elastic namespace which is understood by
 * all of our apm agents
 * https://github.com/elastic/apm/blob/main/specs/agents/tracing-distributed-tracing.md#tracestate
 *
 * rate must be in the range [0,1] with a maximum precision of 4 decimals, and
 * values above 0 but below 0.0001 are rounded up to 0.0001
 * https://github.com/elastic/apm/blob/main/specs/agents/tracing-sampling.md
 */
export function genTraceStateHeader(rate = 1) {
  if (isNaN(rate) || rate < 0 || rate > 1) {
    rate = 1;
  } else if (rate > 0 && rate < MIN_SAMPLE_RATE) {
    rate = MIN_SAMPLE_RATE;
  } else {
    rate = Math.round(rate * 10000) / 10000;
  }
  return `${NAMESPACE}${PROPERTY_SEPARATOR}s:${rate}`;
}

function parseMembers(header?: string) {
  return (header ?? '')
    .split(MEMBER_SEPARATOR)
    .map(member => member.trim())
    .filter(Boolean);
}

function memberKey(member: string) {
  return member.split(PROPERTY_SEPARATOR, 1)[0].trim();
}

/**
 * Add our baggage members to the ones the page already sends instead of
 * replacing them. On duplicate keys our member wins.
 */
export function mergeBaggage(existing: string | undefined, ours: string) {
  const ourMembers = parseMembers(ours);
  const ourKeys = new Set(ourMembers.map(memberKey));
  const kept = parseMembers(existing).filter(
    member => !ourKeys.has(memberKey(member))
  );
  return [...kept, ...ourMembers].join(MEMBER_SEPARATOR);
}

/**
 * Set our `es` entry and keep every other vendor's entry untouched. Per the W3C
 * spec an updated entry moves to the front of the list.
 * https://www.w3.org/TR/trace-context/#tracestate-header-field-values
 */
export function mergeTraceState(existing: string | undefined, ours: string) {
  const kept = parseMembers(existing).filter(
    member => memberKey(member) !== NAMESPACE
  );
  return [ours, ...kept].join(MEMBER_SEPARATOR);
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
export function generateBaggageHeader(journey?: Journey) {
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

  const members: Array<string> = [];
  for (const key of Object.keys(baggageObj)) {
    const value = baggageObj[key];
    if (value) {
      members.push(`${key}${PROPERTY_SEPARATOR}${encodeURIComponent(value)}`);
    }
  }

  return members.join(MEMBER_SEPARATOR);
}

export class Apm {
  // Playwright matches handlers by identity on `unroute`, so the bound handler
  // has to be created once and reused for both `route` and `unroute`.
  private handler = this.traceHandler.bind(this);

  constructor(private driver: Driver, private options: ApmOptions) {}

  async traceHandler(route: Route, request: Request) {
    const existing = request.headers();
    // Merge into whatever the page already sends so the traced app keeps its
    // own baggage and other vendors keep their tracestate entries
    const headers = {
      ...existing,
      [TRACE_STATE_HEADER]: mergeTraceState(
        existing[TRACE_STATE_HEADER],
        genTraceStateHeader(this.options.sampleRate)
      ),
    };
    // Skip our baggage entirely when there is no synthetics context to share
    const baggage = generateBaggageHeader(runner.currentJourney);
    if (baggage) {
      headers[BAGGAGE_HEADER] = mergeBaggage(existing[BAGGAGE_HEADER], baggage);
    }
    route.continue({ headers });
  }

  async start() {
    for (const url of this.options.traceUrls) {
      await this.driver.context.route(url, this.handler);
    }
  }

  async stop() {
    for (const url of this.options.traceUrls) {
      await this.driver.context.unroute(url, this.handler);
    }
  }
}

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
const PROPERTY_SEPARATOR = '=';
// W3C baggage separates list members with ',' (';' is reserved for per-member
// properties), so a single member with ';'-joined pairs would collapse to the
// first key on spec-compliant parsers. https://www.w3.org/TR/baggage/
const MEMBER_SEPARATOR = ',';

function getValueFromEnv(key: string) {
  return process.env?.[key];
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
    // Only baggage is propagated. The page's own `traceparent`/`tracestate`
    // are left untouched so an instrumented page (for example one running the
    // EDOT RUM SDK) stays the owner of the trace and its sampling decision.
    const baggage = generateBaggageHeader(runner.currentJourney);
    if (!baggage) {
      // no synthetics context to share
      await route.continue();
      return;
    }
    // Merge into the baggage the page already sends so the traced app keeps
    // its own members
    const existing = request.headers();
    await route.continue({
      headers: {
        ...existing,
        [BAGGAGE_HEADER]: mergeBaggage(existing[BAGGAGE_HEADER], baggage),
      },
    });
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

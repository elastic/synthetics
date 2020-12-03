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

import { CDPSession } from 'playwright-chromium';
import { FilmStrip } from '../common_types';
import { convertTraceTimestamp } from '../helpers';

/**
 * Trace Event Format
 * https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
 */
type TraceEvent = {
  name: string;
  // event category
  cat: string;
  // process id
  pid: number;
  // thread id
  tid: number;
  // event phase
  ph?: string;
  args?: {
    snapshot: string;
  };
  /**
   * Platform specific monotonic non decreasing clock time
   * https://source.chromium.org/chromium/chromium/src/+/master:base/time/time.h;l=936;bpv=0;bpt=0
   */
  ts: number;
};

export function filterFilmstrips(
  traceEvents: Array<TraceEvent>
): Array<FilmStrip> {
  const events = traceEvents.filter(event => {
    const { args, cat, name } = event;
    return (
      name === 'Screenshot' &&
      cat === 'disabled-by-default-devtools.screenshot' &&
      args?.snapshot
    );
  });

  return events.map(event => ({
    snapshot: event.args.snapshot,
    ts: event.ts,
    startTime: convertTraceTimestamp(event.ts),
  }));
}

/**
 * Custom Tracer that only traces the filmstrips
 * https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
 */
export class Tracing {
  async start(client: CDPSession) {
    const includedCategories = [
      // exclude all default categories
      '-*',
      // capture screenshots
      'disabled-by-default-devtools.screenshot',
    ];
    await client.send('Tracing.start', {
      /**
       * Using `ReportEvents` makes gathering trace events
       * much faster as opposed to using `ReturnAsStream` mode
       */
      transferMode: 'ReportEvents',
      traceConfig: {
        includedCategories,
      },
    });
  }

  async stop(client: CDPSession) {
    const events = [];
    const collectListener = payload => events.push(...payload.value);
    client.on('Tracing.dataCollected', collectListener);

    const [traceEvents] = await Promise.all([
      new Promise(resolve =>
        client.once('Tracing.tracingComplete', () => {
          client.off('Tracing.dataCollected', collectListener);
          resolve(events);
        })
      ),
      client.send('Tracing.end'),
    ]);
    return traceEvents as Array<TraceEvent>;
  }
}

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
  UserTimings,
  ExperienceMetrics,
  CumulativeLayoutShift,
  Filmstrips,
} from '../../src/sdk/trace-metrics';
import { createTestTrace } from '../utils/create-test-trace';
import { USER_TIMING_EVENTS } from '../fixtures/trace/user-timing';
import { FILMSTRIP_EVENTS } from '../fixtures/trace/filmstrips';

describe('Trace metrics', () => {
  const { traceEvents } = createTestTrace();
  it('compute user timing metrics', () => {
    const processEvents = traceEvents.concat(USER_TIMING_EVENTS as any);
    const metrics = UserTimings.compute({ processEvents } as any);
    expect(metrics).toMatchInlineSnapshot(`
      Array [
        Object {
          "end": Object {
            "us": 3069485988748,
          },
          "name": "Next.js-before-hydration",
          "start": Object {
            "us": 3069484776113,
          },
          "type": "measure",
        },
        Object {
          "name": "beforeRender",
          "start": Object {
            "us": 3069485988763,
          },
          "type": "mark",
        },
        Object {
          "name": "afterHydrate",
          "start": Object {
            "us": 3069486106274,
          },
          "type": "mark",
        },
      ]
    `);
  });

  it('compute user experience trace and metrics', () => {
    const timings = {
      firstContentfulPaint: 3,
      largestContentfulPaint: 15,
      domContentLoaded: 20,
    };
    const timestamps = {
      timeOrigin: 5000,
      firstContentfulPaint: 8000,
      largestContentfulPaint: 20000,
      domContentLoaded: 25000,
    };
    const { metrics, traces } = ExperienceMetrics.compute({
      timestamps,
      timings,
    } as any);

    expect(metrics).toEqual({
      fcp: { us: 3000 },
      lcp: { us: 15000 },
      dcl: { us: 20000 },
    });
    expect(traces).toEqual([
      { name: 'navigationStart', type: 'mark', start: { us: 5000 } },
      { name: 'firstContentfulPaint', type: 'mark', start: { us: 8000 } },
      { name: 'largestContentfulPaint', type: 'mark', start: { us: 20000 } },
      { name: 'domContentLoaded', type: 'mark', start: { us: 25000 } },
    ]);
  });

  function makeTrace(events) {
    const shiftEvents = events.map(event => {
      return {
        name: 'LayoutShift',
        cat: 'loading',
        ts: 15,
        args: {
          data: {
            is_main_frame: true,
            had_recent_input: event.had_recent_input,
            score: event.score,
          },
        },
      };
    });
    return traceEvents.concat(shiftEvents);
  }

  it('computes layout shift', () => {
    let mainThreadEvents = makeTrace([
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: true },
    ]);
    expect(CumulativeLayoutShift.compute({ mainThreadEvents } as any)).toEqual({
      cls: 3,
    });

    mainThreadEvents = makeTrace([
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: false },
    ]);
    expect(CumulativeLayoutShift.compute({ mainThreadEvents } as any)).toEqual({
      cls: 4,
    });
  });

  it('returns zero when no layout shift is present ', () => {
    expect(
      CumulativeLayoutShift.compute({ mainThreadEvents: traceEvents } as any)
    ).toEqual({
      cls: 0,
    });
  });

  it('computes filmstrips', () => {
    const events = traceEvents.concat(FILMSTRIP_EVENTS as any);
    const metrics = Filmstrips.compute(events as any);
    expect(metrics.length).toBe(1);
    expect(metrics[0]).toEqual({
      blob: expect.any(String),
      mime: 'image/jpeg',
      start: {
        us: 3086640090360,
      },
    });
  });
});

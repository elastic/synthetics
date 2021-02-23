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
} from '../../src/sdk/trace-metrics';
import { createTestTrace } from '../utils/create-test-trace';
import { USER_TIMING_EVENTS } from '../fixtures/trace/user-timing';

describe('Trace metrics', () => {
  const { traceEvents } = createTestTrace();
  it('compute user timing metrics', async () => {
    const processEvents = traceEvents.concat(USER_TIMING_EVENTS as any);
    const metrics = UserTimings.compute({ processEvents } as any);
    expect(metrics).toMatchInlineSnapshot(`
      Array [
        Object {
          "duration": 1212635,
          "endTime": 3069485.988748,
          "name": "Next.js-before-hydration",
          "startTime": 3069484.776113,
          "ts": 3069485988748,
          "type": "measure",
        },
        Object {
          "name": "beforeRender",
          "startTime": 3069485.988763,
          "ts": 3069485988763,
          "type": "mark",
        },
        Object {
          "name": "afterHydrate",
          "startTime": 3069486.106274,
          "ts": 3069486106274,
          "type": "mark",
        },
      ]
    `);
  });

  it('compute user experience metrics', async () => {
    const domContentLoadedEvt = {
      name: 'domContentLoadedEventEnd',
      ts: 10,
      ph: 'R',
      cat: 'blink.user_timing,rail',
    };
    const firstContentfulPaintEvt = {
      name: 'firstContentfulPaint',
      ts: 8,
      ph: 'R',
      cat: 'loading,rail,devtools.timeline',
    };
    const largestContentfulPaintEvt = {
      name: 'largestContentfulPaint::Candidate',
      ts: 20,
      ph: 'R',
      cat: 'loading,rail,devtools.timeline',
    };
    const metrics = ExperienceMetrics.compute({
      domContentLoadedEvt,
      firstContentfulPaintEvt,
      largestContentfulPaintEvt,
    } as any);

    expect(metrics).toEqual([
      {
        name: 'firstContentfulPaint',
        ts: 8,
        type: 'mark',
        startTime: 0.000008,
      },
      {
        name: 'largestContentfulPaint',
        ts: 20,
        type: 'mark',
        startTime: 0.00002,
      },
      {
        name: 'domContentLoadedEventEnd',
        ts: 10,
        type: 'mark',
        startTime: 0.00001,
      },
    ]);
  });

  it('computes layout shift', () => {
    function makeTrace(events) {
      const shiftEvents = events.map(data => {
        return {
          name: 'LayoutShift',
          cat: 'loading',
          ts: 15,
          args: {
            data: {
              is_main_frame: true,
              had_recent_input: data.had_recent_input,
              score: data.score,
            },
          },
        };
      });
      return traceEvents.concat(shiftEvents);
    }
    let mainThreadEvents = makeTrace([
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: true },
    ]);
    expect(CumulativeLayoutShift.compute({ mainThreadEvents } as any)).toEqual({
      name: 'LayoutShift',
      score: 3,
      ts: 15,
      startTime: 0.000015,
    });

    mainThreadEvents = makeTrace([
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: true },
      { score: 1, had_recent_input: false },
      { score: 1, had_recent_input: false },
    ]);
    expect(CumulativeLayoutShift.compute({ mainThreadEvents } as any)).toEqual({
      name: 'LayoutShift',
      score: 4,
      ts: 15,
      startTime: 0.000015,
    });
  });
});

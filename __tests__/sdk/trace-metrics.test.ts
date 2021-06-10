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
          "end": 3069485.988748,
          "name": "Next.js-before-hydration",
          "start": 3069484.776113,
          "type": "measure",
        },
        Object {
          "name": "beforeRender",
          "start": 3069485.988763,
          "type": "mark",
        },
        Object {
          "name": "afterHydrate",
          "start": 3069486.106274,
          "type": "mark",
        },
      ]
    `);
  });

  const domContentLoadedEvt = {
    name: 'domContentLoadedEventEnd',
    ts: 25000,
    ph: 'R',
    cat: 'blink.user_timing,rail',
  };
  const firstContentfulPaintEvt = {
    name: 'firstContentfulPaint',
    ts: 8000,
    ph: 'R',
    cat: 'loading,rail,devtools.timeline',
  };
  const largestContentfulPaintEvt = {
    name: 'largestContentfulPaint::Candidate',
    ts: 20000,
    ph: 'R',
    cat: 'loading,rail,devtools.timeline',
  };
  const timeOriginEvt = {
    name: 'navigationStart',
    ts: 5000,
    ph: 'R',
    cat: 'loading,rail,devtools.timeline',
  };

  it('compute user experience trace and metrics', () => {
    const { metrics, traces } = ExperienceMetrics.compute({
      domContentLoadedEvt,
      timeOriginEvt,
      firstContentfulPaintEvt,
      largestContentfulPaintEvt,
    } as any);

    expect(metrics).toEqual({
      fcp: { duration: { us: 3000 } },
      lcp: { duration: { us: 15000 } },
      dcl: { duration: { us: 20000 } },
    });
    expect(traces).toEqual([
      { name: 'navigationStart', type: 'mark', start: 0.005 },
      { name: 'firstContentfulPaint', type: 'mark', start: 0.008 },
      { name: 'largestContentfulPaint', type: 'mark', start: 0.02 },
      { name: 'domContentLoadedEventEnd', type: 'mark', start: 0.025 },
    ]);
    ExperienceMetrics.reset();
  });

  it('only compute trace when time origin is not present', () => {
    const { metrics, traces } = ExperienceMetrics.compute({
      domContentLoadedEvt,
      firstContentfulPaintEvt,
      largestContentfulPaintEvt,
    } as any);

    expect(metrics).toEqual({});
    expect(traces).toEqual([
      { name: 'firstContentfulPaint', type: 'mark', start: 0.008 },
      { name: 'largestContentfulPaint', type: 'mark', start: 0.02 },
      { name: 'domContentLoadedEventEnd', type: 'mark', start: 0.025 },
    ]);
    ExperienceMetrics.reset();
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
      start: 3086640.09036,
    });
  });
});

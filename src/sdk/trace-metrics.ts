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

import { FilmStrip, TraceOutput } from '../common_types';
import { convertTraceTimestamp } from '../helpers';
import type { LHTrace, TraceEvent } from './trace-processor';

export class UserTimings {
  static compute(trace: LHTrace) {
    const { processEvents } = trace;
    const measuresMap = new Map();
    const userTimings: Array<TraceOutput> = [];

    for (const event of processEvents) {
      const { name, ph, ts, args } = event;

      if (!event.cat.includes('blink.user_timing')) {
        continue;
      }
      // discard all browser level mark events with frame data
      if (
        name === 'requestStart' ||
        name === 'navigationStart' ||
        name === 'paintNonDefaultBackgroundColor' ||
        args.frame !== undefined
      ) {
        continue;
      }

      const phase = ph.toLowerCase();
      // user timing mark events falls under R and i or I
      if (phase === 'r' || phase === 'i') {
        userTimings.push({
          name,
          ts,
          type: 'mark',
          startTime: convertTraceTimestamp(ts),
        });
      } else if (phase === 'b') {
        measuresMap.set(name, ts);
      } else if (phase === 'e') {
        const startTime = measuresMap.get(name);
        userTimings.push({
          name,
          ts,
          type: 'measure',
          startTime: convertTraceTimestamp(startTime),
          endTime: convertTraceTimestamp(ts),
          duration: ts - startTime,
        });
      }
    }
    return userTimings;
  }
}

export class Filmstrips {
  static compute(trace: LHTrace) {
    const { processEvents } = trace;
    return processEvents
      .filter(event => {
        const { args, name, cat } = event;
        return (
          name === 'Screenshot' &&
          cat === 'disabled-by-default-devtools.screenshot' &&
          args?.snapshot
        );
      })
      .map(event => {
        return {
          snapshot: event.args.snapshot,
          ts: event.ts,
          startTime: convertTraceTimestamp(event.ts),
        } as FilmStrip;
      });
  }
}

export class ExperienceMetrics {
  static buildMetric(event: TraceEvent) {
    if (!event) {
      return;
    }

    return {
      name: event.name,
      ts: event.ts,
      type: 'mark',
      startTime: convertTraceTimestamp(event.ts),
    };
  }

  static compute(trace: LHTrace) {
    const experienceMetrics: Array<TraceOutput> = [];
    const {
      domContentLoadedEvt,
      firstContentfulPaintEvt,
      largestContentfulPaintEvt,
      loadEvt,
      timeOriginEvt,
      lcpInvalidated,
    } = trace;

    experienceMetrics.push(this.buildMetric(timeOriginEvt));
    experienceMetrics.push(this.buildMetric(firstContentfulPaintEvt));
    !lcpInvalidated &&
      experienceMetrics.push(this.buildMetric(largestContentfulPaintEvt));
    experienceMetrics.push(this.buildMetric(domContentLoadedEvt));
    experienceMetrics.push(this.buildMetric(loadEvt));

    return experienceMetrics.filter(b => Boolean(b));
  }
}

export class CumulativeLayoutShift {
  static computeLCPValue(events: Array<TraceEvent>) {
    // find the last LayoutShift event
    let finalLayoutShiftEvent;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.name === 'LayoutShift' && event.args?.data?.is_main_frame) {
        finalLayoutShiftEvent = event;
        break;
      }
    }

    // If no events found, consider the score as 0
    if (!finalLayoutShiftEvent) {
      return {
        value: 0,
      };
    }

    const cumulativeScore = finalLayoutShiftEvent.args.data.cumulative_score;
    // if the score is not available, then we consider it as missing data
    // denoted as -1
    if (cumulativeScore == null) {
      return {
        value: -1,
      };
    }

    /**
     * Calculate the cumulative score from summing all the individual
     * score from each layout shift events as cumulative score value
     * results in inconsistencies when there was user input during navigation start
     *  See https://bugs.chromium.org/p/chromium/issues/detail?id=1094974
     */
    const score = events
      .filter(
        e =>
          e.name === 'LayoutShift' &&
          e.args?.data &&
          e.args.data.is_main_frame &&
          !e.args.data.had_recent_input
      )
      .map(e => e.args.data.score)
      .reduce((acc, value) => acc + value, 0);

    return {
      value: score,
      event: finalLayoutShiftEvent,
    };
  }

  static compute(trace: LHTrace) {
    const events = trace.mainThreadEvents;
    const { value, event } = this.computeLCPValue(events);

    return {
      name: event.name,
      type: 'measure',
      duration: value,
      ts: event.ts,
      startTime: convertTraceTimestamp(event.ts),
    } as TraceOutput;
  }
}

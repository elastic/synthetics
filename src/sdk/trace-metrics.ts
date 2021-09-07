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

import { Filmstrip, TraceOutput } from '../common_types';
import type {
  LHProcessedNavigation,
  LHProcessedTrace,
  TraceEvent,
} from './trace-processor';

export class UserTimings {
  static compute(trace: LHProcessedTrace) {
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

      /**
       * user timing mark events falls under `R` and i or I
       * measure events starts with `b` and ends with `e`
       * Doc - https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/edit#heading=h.puwqg050lyuy
       */
      const phase = ph.toLowerCase();
      if (phase === 'r' || phase === 'i') {
        userTimings.push({
          name,
          type: 'mark',
          start: {
            us: ts,
          },
        });
      } else if (phase === 'b') {
        measuresMap.set(name, ts);
      } else if (phase === 'e') {
        const startTime = measuresMap.get(name);
        userTimings.push({
          name,
          type: 'measure',
          start: {
            us: startTime,
          },
          duration: {
            us: ts - startTime,
          },
        });
      }
    }
    return userTimings;
  }
}

export class ExperienceMetrics {
  static buildMetric(name: string, timestamp?: number) {
    if (!timestamp) {
      return;
    }
    return {
      name,
      type: 'mark',
      start: {
        us: timestamp,
      },
    };
  }

  static compute(trace: LHProcessedNavigation) {
    const traces: Array<TraceOutput> = [];
    const { timestamps, timings, lcpInvalidated } = trace;

    traces.push(this.buildMetric('navigationStart', timestamps.timeOrigin));
    traces.push(
      this.buildMetric('firstContentfulPaint', timestamps.firstContentfulPaint)
    );
    /**
     * lcpInvalidated - Denotes when all of the LCP events that comes from the
     * current trace are invalidated. Happens if the previous LCP candidates were
     * suppressed by another event coming later during the page load
     * More info - https://github.com/WICG/largest-contentful-paint/#the-last-candidate
     */
    !lcpInvalidated &&
      traces.push(
        this.buildMetric(
          'largestContentfulPaint',
          timestamps.largestContentfulPaint
        )
      );
    traces.push(
      this.buildMetric('domContentLoaded', timestamps.domContentLoaded)
    );
    traces.push(this.buildMetric('loadEvent', timestamps.load));

    /**
     * Lighthouse tracer extracts these metrics in milliseconds resolution,
     * we convert them to microseconds resolution to keep them in sync with
     * other timings
     */
    const millisToMicros = (value?: number) =>
      value ? value * 1000 : undefined;
    const keys = [
      'firstContentfulPaint',
      'largestContentfulPaint',
      'domContentLoaded',
      'load',
    ];
    const values = ['fcp', 'lcp', 'dcl', 'load'];
    const metrics = {};

    for (let i = 0; i < keys.length; i++) {
      const microSecs = millisToMicros(timings[keys[i]]);
      if (microSecs) {
        metrics[values[i]] = { us: microSecs };
      }
    }

    return {
      metrics,
      traces: traces.filter(b => Boolean(b)),
    };
  }
}

export class CumulativeLayoutShift {
  static getLayoutShiftEvents(traceEvents: Array<TraceEvent>) {
    const layoutShiftEvents = [];
    // Chromium will set `had_recent_input` if there was recent user input, which
    // skips shift events from contributing to CLS. This results in the first few shift
    // events having `had_recent_input` set to true, so ignore it for those events.
    // See https://crbug.com/1094974
    let ignoreHadRecentInput = true;

    for (const event of traceEvents) {
      // weighted_score_delta was added in chrome 90 - https://crbug.com/1173139
      if (
        event.name !== 'LayoutShift' ||
        !event.args?.data.is_main_frame ||
        !event.args?.data.weighted_score_delta
      ) {
        continue;
      }

      if (event.args.data.had_recent_input) {
        if (!ignoreHadRecentInput) continue;
      } else {
        ignoreHadRecentInput = false;
      }

      layoutShiftEvents.push({
        ts: event.ts,
        weightedScore: event.args.data.weighted_score_delta,
      });
    }

    return layoutShiftEvents;
  }

  /**
   * Calculate cumulative layout shift per sesion window where each session
   * windows lasts for 5 seconds since the last layoutShift event and has 1 second
   * gap between them. Return the maximum score between all windows.
   * More details - https://web.dev/evolving-cls/
   */
  static calculateScore(layoutShiftEvents) {
    const gapMicroseconds = 1_000_000; // 1 seconds gap
    const limitMicroseconds = 5_000_000; // 5 seconds window
    let maxScore = 0;
    let currentScore = 0;
    let firstTimestamp = Number.NEGATIVE_INFINITY;
    let prevTimestamp = Number.NEGATIVE_INFINITY;

    for (const event of layoutShiftEvents) {
      const currTimestamp = event.ts;
      /**
       * Two cases
       * - When the next layout shift event happened after the session window of
       * 5 seconds.
       * - When the next and previous layout shift event has a gap of 1 second
       *
       * Then consider the layout shift event as the start of
       * the current session window and reset the cumulative score.
       */
      if (
        currTimestamp - firstTimestamp > limitMicroseconds ||
        currTimestamp - prevTimestamp > gapMicroseconds
      ) {
        firstTimestamp = currTimestamp;
        currentScore = 0;
      }
      prevTimestamp = currTimestamp;
      currentScore += event.weightedScore;
      maxScore = Math.max(maxScore, currentScore);
    }

    return maxScore;
  }

  static compute(trace: LHProcessedTrace) {
    const layoutShiftEvents = this.getLayoutShiftEvents(trace.frameTreeEvents);
    const traces: Array<TraceOutput> = layoutShiftEvents.map(event => {
      return {
        name: 'layoutShift',
        type: 'mark',
        start: {
          us: event.ts,
        },
        score: event.weightedScore,
      };
    });
    const cumulativeLayoutShiftScore = this.calculateScore(layoutShiftEvents);

    return {
      cls: cumulativeLayoutShiftScore,
      traces,
    };
  }
}

export class Filmstrips {
  static filterExcesssiveScreenshots(events: Array<TraceEvent>) {
    const screenshotEvents = events.filter(
      evt => evt.name === 'Screenshot' && evt.args?.snapshot
    );
    const screenshotTimestamps = screenshotEvents.map(event => event.ts);

    let lastScreenshotTs = -Infinity;
    return screenshotEvents.filter(evt => {
      const timeSinceLastScreenshot = evt.ts - lastScreenshotTs;
      const nextScreenshotTs = screenshotTimestamps.find(ts => ts > evt.ts);
      const timeUntilNextScreenshot = nextScreenshotTs
        ? nextScreenshotTs - evt.ts
        : Infinity;
      const threshold = 500 * 1000; // Throttle to ~2fps
      // Keep the frame if it's been more than 500ms since the last frame we kept or the next frame won't happen for at least 500ms
      const shouldKeep =
        timeUntilNextScreenshot > threshold ||
        timeSinceLastScreenshot > threshold;
      if (shouldKeep) lastScreenshotTs = evt.ts;
      return shouldKeep;
    });
  }

  static compute(traceEvents: Array<TraceEvent>): Array<Filmstrip> {
    return Filmstrips.filterExcesssiveScreenshots(traceEvents).map(event => ({
      blob: event.args.snapshot,
      mime: 'image/jpeg',
      start: {
        us: event.ts,
      },
    }));
  }
}

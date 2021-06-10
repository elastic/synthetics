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

import { Filmstrip, TraceOutput, PerfMetrics } from '../common_types';
import { convertToMonotonicTime, getDurationInUs } from '../helpers';
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
          start: convertToMonotonicTime(ts),
        });
      } else if (phase === 'b') {
        measuresMap.set(name, ts);
      } else if (phase === 'e') {
        const startTime = measuresMap.get(name);
        userTimings.push({
          name,
          type: 'measure',
          start: convertToMonotonicTime(startTime),
          end: convertToMonotonicTime(ts),
        });
      }
    }
    return userTimings;
  }
}

export class ExperienceMetrics {
  static monotonicNavStartTime = null;
  static metrics: Partial<PerfMetrics> = {};

  static buildMetric(event: TraceEvent, shortName?: string, name?: string) {
    if (!event) {
      return;
    }
    /**
     * Calculate metrics relative to the origin event in microseconds
     */
    if (this.monotonicNavStartTime) {
      this.metrics[shortName] = {
        duration: {
          us: getDurationInUs(
            convertToMonotonicTime(event.ts) - this.monotonicNavStartTime
          ),
        },
      };
    }
    return {
      name: name || event.name,
      type: 'mark',
      start: convertToMonotonicTime(event.ts),
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

    const navigationStartEvent = this.buildMetric(timeOriginEvt);
    if (navigationStartEvent) {
      this.monotonicNavStartTime = navigationStartEvent.start;
    }
    experienceMetrics.push(navigationStartEvent);
    experienceMetrics.push(this.buildMetric(firstContentfulPaintEvt, 'fcp'));
    /**
     * lcpInvalidated - Denotes when all of the LCP events that comes from the
     * current trace are invalidated. Happens if the previous LCP candidates were
     * suppressed by another event coming later during the page load
     * More info - https://github.com/WICG/largest-contentful-paint/#the-last-candidate
     */
    !lcpInvalidated &&
      experienceMetrics.push(
        this.buildMetric(
          largestContentfulPaintEvt,
          'lcp',
          'largestContentfulPaint'
        )
      );
    experienceMetrics.push(this.buildMetric(domContentLoadedEvt, 'dcl'));
    experienceMetrics.push(this.buildMetric(loadEvt, 'load'));

    return {
      metrics: this.metrics,
      traces: experienceMetrics.filter(b => Boolean(b)),
    };
  }

  static reset() {
    this.monotonicNavStartTime = null;
    this.metrics = {};
  }
}

export class CumulativeLayoutShift {
  static computeCLSValue(events: Array<TraceEvent>) {
    const layoutShiftEvents = events.filter(
      event => event.name === 'LayoutShift' && event.args?.data.is_main_frame
    );
    // Chromium will set `had_recent_input` if there was recent user input, which
    // skips shift events from contributing to CLS. This results in the first few shift
    // events having `had_recent_input` set to true, so ignore it for those events.
    // See https://bugs.chromium.org/p/chromium/issues/detail?id=1094974.
    let ignoreHadRecentInput = true;
    let finalLayoutShiftEvent;
    let clsScore = 0;
    for (const event of layoutShiftEvents) {
      if (event.args.data.had_recent_input) {
        if (!ignoreHadRecentInput) continue;
      } else {
        ignoreHadRecentInput = false;
      }
      clsScore += event.args.data.score;
      finalLayoutShiftEvent = event;
    }

    return { score: clsScore, event: finalLayoutShiftEvent };
  }

  static compute(trace: LHTrace) {
    const events = trace.mainThreadEvents;
    const { score } = this.computeCLSValue(events);

    return {
      cls: score,
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
      start: convertToMonotonicTime(event.ts),
    }));
  }
}

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

import LighthouseTraceProcessor from 'lighthouse/lighthouse-core/lib/tracehouse/trace-processor';
import { ExperienceMetrics, Filmstrips, UserTimings } from './trace-metrics';

const ACCEPTABLE_NAVIGATION_URL_REGEX = /^(file|https?):/;

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
    frame: string;
    data: Record<string, unknown>;
  };
  /**
   * Platform specific monotonic non decreasing clock time
   * https://source.chromium.org/chromium/chromium/src/+/master:base/time/time.h;l=936;bpv=0;bpt=0
   */
  ts: number;
};

/**
 * Exported data from Lighthouse trace processor
 */
export type LHTrace = {
  domContentLoadedEvt: TraceEvent;
  firstContentfulPaintEvt: TraceEvent;
  largestContentfulPaintEvt: TraceEvent;
  loadEvt: TraceEvent;
  timeOriginEvt: TraceEvent;
  lcpInvalidated: boolean;
  processEvents: Array<TraceEvent>;
};

/**
 * Extends
 */
export class TraceProcessor extends LighthouseTraceProcessor {
  static _isNavigationStartOfInterest(event) {
    return (
      event.name === 'navigationStart' &&
      (!event.args.data ||
        !event.args.data.documentLoaderURL ||
        ACCEPTABLE_NAVIGATION_URL_REGEX.test(event.args.data.documentLoaderURL))
    );
  }

  static computeTraceOfTab(traceEvents) {
    const options = {
      timeOriginDeterminationMethod: 'lastNavigationStart',
    };
    const trace: LHTrace = super.computeTraceOfTab({ traceEvents }, options);
    const userTiming = UserTimings.compute(trace);
    const filmstrips = Filmstrips.compute(trace);
    const experience = ExperienceMetrics.compute(trace);

    return {
      userTiming,
      filmstrips,
      experience,
    };
  }
}

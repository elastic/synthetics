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

import { Request } from 'playwright-core';
import { NetworkInfo } from './common_types';

/**
 * Resource Timing shape shared by `Request.timing()` and (>= 1.62)
 * `APIResponse.timing()`. Values are milliseconds relative to `startTime`,
 * `-1` when a phase did not happen or is unknown (e.g. reused keep-alive
 * socket, HAR replay).
 */
export type ResourceTiming = ReturnType<Request['timing']>;

export const roundMilliSecs = (value: number): number => {
  return Math.floor(value * 1000) / 1000;
};

/**
 * First positive number in the list, used to derive the `blocked` phase from
 * whichever Resource Timing marker fired first.
 */
export const firstPositive = (numbers: number[]): number | null => {
  for (let i = 0; i < numbers.length; ++i) {
    if (numbers[i] > 0) {
      return numbers[i];
    }
  }
  return null;
};

/**
 * Maps a Playwright Resource Timing object into the per-phase `NetworkInfo`
 * timings. `total` is left at `-1` for the caller to fill via `calcTotalTime`
 * once `loadEndTime`/`requestSentTime` are known. `receive` resolves to `-1`
 * until `responseEnd` is available (browser journeys learn it on
 * `requestfinished`); API journeys have the full timing up front.
 */
export function getResourceTimings(
  rtiming: ResourceTiming
): NetworkInfo['timings'] {
  const blocked =
    roundMilliSecs(
      firstPositive([
        rtiming.domainLookupStart,
        rtiming.connectStart,
        rtiming.requestStart,
      ])
    ) || -1;
  const dns =
    rtiming.domainLookupEnd !== -1
      ? roundMilliSecs(rtiming.domainLookupEnd - rtiming.domainLookupStart)
      : -1;
  const connect =
    rtiming.connectEnd !== -1
      ? roundMilliSecs(rtiming.connectEnd - rtiming.connectStart)
      : -1;
  const ssl =
    rtiming.secureConnectionStart !== -1
      ? roundMilliSecs(rtiming.connectEnd - rtiming.secureConnectionStart)
      : -1;
  const wait =
    rtiming.responseStart !== -1
      ? roundMilliSecs(rtiming.responseStart - rtiming.requestStart)
      : -1;
  const receive =
    rtiming.responseEnd !== -1
      ? roundMilliSecs(rtiming.responseEnd - rtiming.responseStart)
      : -1;

  return {
    blocked,
    dns,
    ssl,
    connect,
    send: 0, // not exposed via the Resource Timing API
    wait,
    receive,
    total: -1,
  };
}

/**
 * Returns the `total` phase by summing the positive phases. Falls back to the
 * wall-clock span between `requestSentTime` and `loadEndTime` when Resource
 * Timing data is unavailable (`startTime <= 0`, e.g. HAR replay or aborted
 * requests). Pure — the caller assigns the result onto `timings.total`.
 */
export function calcTotalTime(
  entry: NetworkInfo,
  rtiming: ResourceTiming
): number {
  if (rtiming.startTime <= 0) {
    const end =
      entry.loadEndTime || entry.responseReceivedTime || entry.requestSentTime;
    const total = roundMilliSecs((end - entry.requestSentTime) * 1000);
    return total <= 0 ? -1 : total;
  }

  const { timings } = entry;
  return [
    timings.blocked,
    timings.dns,
    timings.connect,
    timings.wait,
    timings.receive,
  ].reduce((pre, cur) => ((cur || -1) > 0 ? cur + pre : pre), 0);
}

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

import { NetworkInfo } from '../src/common_types';
import {
  ResourceTiming,
  calcTotalTime,
  getResourceTimings,
} from '../src/network-timings';

const entryWith = (
  timings: NetworkInfo['timings'],
  extra: Partial<NetworkInfo> = {}
): NetworkInfo =>
  ({
    requestSentTime: 0,
    loadEndTime: 0,
    responseReceivedTime: 0,
    timings,
    ...extra,
  } as NetworkInfo);

describe('network-timings', () => {
  it('maps a full HTTPS resource timing into phase durations', () => {
    const rtiming: ResourceTiming = {
      startTime: 1000,
      domainLookupStart: 1,
      domainLookupEnd: 3,
      connectStart: 3,
      secureConnectionStart: 5,
      connectEnd: 10,
      requestStart: 10,
      responseStart: 20,
      responseEnd: 30,
    };
    const timings = getResourceTimings(rtiming);
    expect(timings).toEqual({
      blocked: 1, // first positive of domainLookupStart/connectStart/requestStart
      dns: 2, // domainLookupEnd - domainLookupStart
      connect: 7, // connectEnd - connectStart
      ssl: 5, // connectEnd - secureConnectionStart
      send: 0,
      wait: 10, // responseStart - requestStart
      receive: 10, // responseEnd - responseStart
      total: -1, // filled by calcTotalTime
    });

    // sum of positive blocked + dns + connect + wait + receive (ssl/send excluded)
    expect(calcTotalTime(entryWith(timings), rtiming)).toBe(30);
  });

  it('reports -1 for phases skipped on a reused socket / cached DNS', () => {
    const rtiming: ResourceTiming = {
      startTime: 1000,
      domainLookupStart: -1,
      domainLookupEnd: -1,
      connectStart: -1,
      secureConnectionStart: -1,
      connectEnd: -1,
      requestStart: 0.5,
      responseStart: 5,
      responseEnd: 8,
    };
    const timings = getResourceTimings(rtiming);
    expect(timings.dns).toBe(-1);
    expect(timings.connect).toBe(-1);
    expect(timings.ssl).toBe(-1);
    expect(timings.blocked).toBe(0.5);
    expect(timings.wait).toBe(4.5);
    expect(timings.receive).toBe(3);

    expect(calcTotalTime(entryWith(timings), rtiming)).toBe(8);
  });

  it('falls back to the wall-clock span when resource timing is unavailable', () => {
    const rtiming: ResourceTiming = {
      startTime: -1,
      domainLookupStart: -1,
      domainLookupEnd: -1,
      connectStart: -1,
      secureConnectionStart: -1,
      connectEnd: -1,
      requestStart: -1,
      responseStart: -1,
      responseEnd: -1,
    };
    const timings = getResourceTimings(rtiming);
    expect(timings).toMatchObject({
      blocked: -1,
      dns: -1,
      connect: -1,
      ssl: -1,
      wait: -1,
      receive: -1,
      send: 0,
    });

    // requestSentTime/loadEndTime are epoch seconds; span -> ms.
    const total = calcTotalTime(
      entryWith(timings, { requestSentTime: 100, loadEndTime: 100.5 }),
      rtiming
    );
    expect(total).toBe(500);
  });
});

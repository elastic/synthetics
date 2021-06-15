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

const pid = 1000;
const tid = 2000;
const frame = 'A1'.repeat(16);

export function createTestTrace() {
  const timeOrigin = 0;
  const traceEvents = [
    {
      name: 'navigationStart',
      ts: timeOrigin,
      pid,
      tid,
      ph: 'R',
      cat: 'blink.user_timing',
      args: {
        frame,
        data: { documentLoaderURL: '' },
      },
    },
    {
      name: 'TracingStartedInBrowser',
      ts: timeOrigin,
      pid,
      tid,
      ph: 'I',
      cat: 'disabled-by-default-devtools.timeline',
      args: {
        data: {
          frameTreeNodeId: 6,
          persistentIds: true,
          frames: [{ frame, url: 'about:blank', name: '', processId: pid }],
        },
      },
      s: 't',
    },
    {
      name: 'thread_name',
      ts: timeOrigin,
      pid,
      tid,
      ph: 'M',
      cat: '__metadata',
      args: { name: 'CrRendererMain' },
    },
    {
      args: {
        data: {
          cumulative_score: 0.23466634114583335,
          had_recent_input: false,
          is_main_frame: true,
          score: 0.19932291666666668,
          weighted_score_delta: 0.19932291666666668,
        },
      },
      cat: 'loading',
      name: 'LayoutShift',
      ph: 'I',
      tid: 775,
      ts: 463045197179,
    },
    {
      args: {
        data: {
          cumulative_score: 1.1788216688368056,
          had_recent_input: false,
          is_main_frame: true,
          score: 0.21037326388888888,
          weighted_score_delta: 0.21037326388888888,
        },
      },
      cat: 'loading',
      name: 'LayoutShift',
      ph: 'I',
      tid: 775,
      ts: 463047103153,
    },
    {
      args: {
        data: {
          cumulative_score: 4.809793674045139,
          had_recent_input: false,
          score: 0.1991644965277778,
          weighted_score_delta: 0.1991644965277778,
        },
      },
      cat: 'loading',
      name: 'LayoutShift',
      ph: 'I',
      tid: 775,
      ts: 463052381097,
    },
  ];

  return { traceEvents };
}

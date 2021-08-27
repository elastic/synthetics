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

import { TraceProcessor } from '../../src/sdk/trace-processor';
import { createTestTrace } from '../utils/create-test-trace';

describe('Trace processor', () => {
  it('computes trace of the tab', () => {
    const { traceEvents } = createTestTrace();
    const { metrics, traces } = TraceProcessor.computeTrace(traceEvents as any);
    expect(metrics).toEqual({
      cls: 0.40969618055555557,
      fcp: {
        us: 200,
      },
    });
    expect(traces).toEqual([
      {
        name: 'firstContentfulPaint',
        type: 'mark',
        start: { us: 200 },
      },
      {
        name: 'layoutShift',
        type: 'mark',
        start: { us: 300 },
        score: 0.19932291666666668,
      },
      {
        name: 'layoutShift',
        type: 'mark',
        start: { us: 400 },
        score: 0.21037326388888888,
      },
    ]);
  });
});

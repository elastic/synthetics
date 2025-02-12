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

import fs from 'fs';
import { run, journey } from '../src/index';
import { generateTempPath } from '../src/helpers';

describe('Run', () => {
  const dest = generateTempPath();
  afterEach(() => {
    fs.existsSync(dest) && fs.unlinkSync(dest);
  });

  it('multiple run invokes runner only once', async () => {
    journey('j1', () => {});
    journey('j2', () => {});
    /**
     * call multiple runs in parallel simulating
     * CLI and programmatic API runs
     */
    const promises = [run, run].map(r =>
      r({
        outfd: fs.openSync(dest, 'w'),
      })
    );
    const results = await Promise.all(promises);

    expect(results).toMatchObject([
      {
        j1: { status: 'succeeded', steps: [] },
        j2: { status: 'succeeded', steps: [] },
      },
      {},
    ]);
  });
});

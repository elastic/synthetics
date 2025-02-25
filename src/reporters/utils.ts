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

import { Screenshot } from '../common_types';
import { isDirectory, totalist } from '../helpers';
import { readFileSync } from 'fs';

/**
 * Get all the screenshots from the cached screenshot location
 * at the end of each journey and construct equally sized blocks out
 * of the individual screenshot image.
 */
export async function gatherScreenshots(
  screenshotsPath: string,
  callback: (data: Screenshot) => Promise<void>
) {
  if (isDirectory(screenshotsPath)) {
    await totalist(screenshotsPath, async (_, absPath) => {
      try {
        const content = readFileSync(absPath, 'utf8');
        const screenshot: Screenshot = JSON.parse(content);
        await callback(screenshot);
      } catch (_) {
        // TODO: capture programmatic synthetic errors under different type
      }
    });
  }
}

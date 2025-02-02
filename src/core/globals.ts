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

import Runner from './runner';

/**
 * Use a gloabl Runner which would be accessed by the runtime and
 * required to handle the local vs global invocation through CLI
 */
const SYNTHETICS_RUNNER = Symbol.for('SYNTHETICS_RUNNER');
if (!global[SYNTHETICS_RUNNER]) {
  global[SYNTHETICS_RUNNER] = new Runner();
}

/**
 * Set debug based on DEBUG ENV and namespace - synthetics
 */
if (process.env.DEBUG && process.env.DEBUG.includes('synthetics')) {
  process.env['__SYNTHETICS__DEBUG__'] = '1';
}

export const runner: Runner = global[SYNTHETICS_RUNNER];

// is Debug mode enabled
export function inDebugMode() {
  return !!process.env['__SYNTHETICS__DEBUG__'];
}

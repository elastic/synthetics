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

import { runner } from './core';
import { RunOptions } from './core/runner';
import { setLogger } from './core/logger';
import sourceMapSupport from 'source-map-support';

export async function run(options: RunOptions) {
  /**
   * Install source map support
   */
  sourceMapSupport.install({
    environment: 'node',
  });
  /**
   * Use the NODE_ENV variable to control the environment if its not explicity
   * passed from either CLI or through the API
   */
  options.environment = options.environment || process.env['NODE_ENV'];
  /**
   * set up logger with appropriate file descriptor
   * to capture all the DEBUG logs when run through heartbeat
   */
  setLogger(options.outfd);

  try {
    return await runner.run({
      ...options,
      headless: options.headless ?? true,
      sandbox: options.sandbox ?? true,
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export { beforeAll, afterAll, journey, step, before, after } from './core';

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
import { parseArgs } from './parse_args';

/* eslint-disable @typescript-eslint/no-var-requires */
require('source-map-support').install();

export async function run(options: RunOptions) {
  const cliArgs = parseArgs();
  /**
   * Use the NODE_ENV variable to control the environment if its not explicity
   * passed from either CLI or through the API
   */
  options.environment = options.environment || process.env['NODE_ENV'];
  /**
   * set up logger with appropriate file descriptor
   * to capture all the DEBUG logs when running from heartbeat
   */
  const outfd = options.outfd ?? cliArgs.outfd;
  setLogger(outfd);

  try {
    await runner.run({
      ...options,
      headless: options.headless ?? cliArgs.headless,
      screenshots: options.screenshots ?? cliArgs.screenshots,
      dryRun: options.dryRun ?? cliArgs.dryRun,
      journeyName: options.journeyName ?? cliArgs.journeyName,
      network: options.network ?? cliArgs.network,
      pauseOnError: options.pauseOnError ?? cliArgs.pauseOnError,
      reporter: cliArgs.json && !options.reporter ? 'json' : options.reporter,
      outfd,
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export { beforeAll, afterAll, journey, step, before, after } from './core';

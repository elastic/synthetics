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

import merge from 'deepmerge';
import { readConfig } from './config';
import { parseNetworkConditions } from './helpers';
import type { CliArgs, RunOptions } from './common_types';

/**
 * Set debug based on DEBUG ENV and -d flags
 * namespace - synthetics
 */
const namespace = 'synthetics';
if (process.env.DEBUG && process.env.DEBUG.includes(namespace)) {
  process.env.DEBUG = '1';
}

export function normalizeOptions(cliArgs: CliArgs): RunOptions {
  const options: RunOptions = {
    ...cliArgs,
    environment: process.env['NODE_ENV'] || 'development',
  };
  /**
   * Group all events that can be consumed by heartbeat and
   * eventually by the Synthetics UI.
   */
  if (cliArgs.richEvents) {
    options.reporter = cliArgs.reporter ?? 'json';
    options.ssblocks = true;
    options.network = true;
    options.trace = true;
    options.quietExitCode = true;
  }

  if (cliArgs.capability) {
    const supportedCapabilities = [
      'trace',
      'network',
      'filmstrips',
      'metrics',
      'ssblocks',
    ];
    /**
     * trace - record chrome trace events(LCP, FCP, CLS, etc.) for all journeys
     * network - capture network information for all journeys
     * filmstrips - record detailed filmstrips for all journeys
     * metrics - capture performance metrics (DOM Nodes, Heap size, etc.) for each step
     * ssblocks - Dedupes the screenshots in to blocks to save storage space
     */
    for (const flag of cliArgs.capability) {
      if (supportedCapabilities.includes(flag)) {
        options[flag] = true;
      } else {
        console.warn(
          `Missing capability "${flag}", current supported capabilities are ${supportedCapabilities.join(
            ', '
          )}`
        );
      }
    }
  }

  /**
   * Validate and read synthetics config file
   * based on the environment
   */
  const config =
    cliArgs.config || !cliArgs.inline
      ? readConfig(options.environment, cliArgs.config)
      : {};

  options.params = Object.freeze(merge(config.params, cliArgs.params || {}));

  /**
   * Favor playwright options passed via cli to inline playwright options
   */
  options.playwrightOptions = merge.all([
    config.playwrightOptions || {},
    cliArgs.playwrightOptions || {},
    {
      headless: cliArgs.headless,
      chromiumSandbox: cliArgs.sandbox,
      ignoreHTTPSErrors: cliArgs.ignoreHttpsErrors,
    },
  ]);

  if (cliArgs.throttling) {
    options.networkConditions = parseNetworkConditions(
      cliArgs.throttling as string
    );
  }

  return options;
}

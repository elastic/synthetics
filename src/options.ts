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
import { getNetworkConditions, DEFAULT_THROTTLING_OPTIONS } from './helpers';
import type { CliArgs, RunOptions, ThrottlingOptions } from './common_types';
import { MonitorConfig } from './dsl/monitor';

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

  /**
   * Order of preference for options that are used while running are
   * 1. Local options configured via Runner API
   * 2. CLI flags
   * 3. Configuration file
   */
  options.params = Object.freeze(merge(config.params, cliArgs.params || {}));

  options.playwrightOptions = merge.all([
    config.playwrightOptions || {},
    cliArgs.playwrightOptions || {},
    {
      headless: cliArgs.headless,
      chromiumSandbox: cliArgs.sandbox,
      ignoreHTTPSErrors: cliArgs.ignoreHttpsErrors,
    },
  ]);

  const defaults = getDefaultMonitorConfig();
  if (cliArgs.throttling) {
    const throttleConfig = merge.all([
      defaults.throttling,
      config.monitor?.throttling || {},
      cliArgs.throttling as ThrottlingOptions,
    ]);
    options.throttling = throttleConfig;
    options.networkConditions = getNetworkConditions(throttleConfig);
  } else {
    /**
     * Do not apply throttling when `--no-throttling` flag is passed
     */
    options.throttling = {};
  }

  options.locations =
    cliArgs.locations ?? config.monitor?.locations ?? defaults.locations;

  options.schedule =
    cliArgs.schedule ?? config.monitor?.schedule ?? defaults.schedule;

  return options;
}

/**
 * Get the default monitor configuration for all journeys
 */
export function getDefaultMonitorConfig(): MonitorConfig {
  return {
    throttling: DEFAULT_THROTTLING_OPTIONS,
    locations: ['North America - US East'],
    schedule: 10,
  };
}

/**
 * Parses the throttling CLI settings and also
 * adapts to the format to keep the backwards compatability
 * - Accepts old format `<5d/3u/20l>`
 * - Processess new format otherwise `{download: 5, upload: 3, latency: 20}`
 */
export function parseThrottling(value: string, prev?: string) {
  const THROTTLING_REGEX = /([0-9]{1,}u)|([0-9]{1,}d)|([0-9]{1,}l)/gm;
  if (THROTTLING_REGEX.test(value)) {
    const throttling: ThrottlingOptions = {};
    const conditions = value.split('/');

    conditions.forEach(condition => {
      const setting = condition.slice(0, condition.length - 1);
      const token = condition.slice(-1);
      switch (token) {
        case 'd':
          throttling.download = Number(setting);
          break;
        case 'u':
          throttling.upload = Number(setting);
          break;
        case 'l':
          throttling.latency = Number(setting);
          break;
      }
    });
    return throttling;
  }
  return JSON.parse(value || prev);
}

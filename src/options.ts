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
import { createOption } from 'commander';
import { readConfig } from './config';
import type { CliArgs, PushOptions, RunOptions } from './common_types';
import { THROTTLING_WARNING_MSG, error, warn } from './helpers';

type Mode = 'run' | 'push';

export async function normalizeOptions(
  cliArgs: CliArgs,
  mode: Mode = 'run'
): Promise<RunOptions> {
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
      ? await readConfig(options.environment, cliArgs.config)
      : {};

  /**
   * Order of preference for options that are used while running are
   * 1. Local options configured via Runner API
   * 2. CLI flags
   * 3. Configuration file
   */
  options.params = Object.freeze(merge(config.params, cliArgs.params || {}));

  /**
   * Merge playwright options from CLI and Synthetics config
   * and prefer individual options over other option
   */
  const playwrightOpts = merge(
    config.playwrightOptions,
    cliArgs.playwrightOptions || {}
  );
  options.playwrightOptions = {
    ...playwrightOpts,
    headless: getHeadlessFlag(cliArgs.headless, playwrightOpts?.headless),
    chromiumSandbox: cliArgs.sandbox ?? playwrightOpts?.chromiumSandbox,
    ignoreHTTPSErrors:
      cliArgs.ignoreHttpsErrors ?? playwrightOpts?.ignoreHTTPSErrors,
  };

  /**
   * Merge default options based on the mode of operation whether we are running tests locally
   * or pushing the project monitors
   */
  switch (mode) {
    case 'run':
      options.screenshots = cliArgs.screenshots ?? 'on';
      break;
    case 'push':
      validatePushOptions(options as PushOptions);
      /**
       * Merge the default monitor config from synthetics.config.ts file
       * with the CLI options passed via push command
       */
      const monitor = config.monitor;
      for (const key of Object.keys(monitor || {})) {
        // screenshots require special handling as the flags are different
        if (key === 'screenshot') {
          options.screenshots = options.screenshots ?? monitor[key];
          continue;
        }
        options[key] = options[key] ?? monitor[key];
      }
      break;
  }
  return options;
}

export function getHeadlessFlag(
  cliHeadless: boolean,
  configHeadless?: boolean
) {
  // if cliHeadless is false, then we don't care about configHeadless
  if (!cliHeadless) {
    return false;
  }
  // default is headless
  return configHeadless ?? true;
}

export function validatePushOptions(opts: PushOptions) {
  if (opts.tags || opts.match) {
    throw error(`Aborted. Invalid CLI flags.

Tags and Match are not supported in push command.`);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
function toObject(value: boolean | Record<string, any>): Record<string, any> {
  const defaulVal = {};
  if (typeof value === 'boolean') {
    return defaulVal;
  }
  return value || defaulVal;
}

/**
 * Parses the throttling CLI settings with `{download: 5, upload: 3, latency:
 * 20}` format
 *
 * Since throttling is disabled for now, we warn the users if throttling/nothrottling
 * flag is passed to the CLI
 */
export function parseThrottling() {
  warn(THROTTLING_WARNING_MSG);
}

export function getCommonCommandOpts() {
  const params = createOption(
    '-p, --params <jsonstring>',
    'JSON object that gets injected to all journeys'
  ).argParser(JSON.parse);

  const playwrightOpts = createOption(
    '--playwright-options <jsonstring>',
    'JSON object to pass in custom Playwright options for the agent. Options passed will be merged with Playwright options defined in your synthetics.config.js file.'
  ).argParser(JSON.parse);

  const pattern = createOption(
    '--pattern <pattern>',
    'RegExp pattern to match journey/monitor files that are different from the default (ex: /*.journey.(ts|js)$/)'
  );

  const apiDocsLink =
    'API key used for Kibana authentication(https://www.elastic.co/guide/en/kibana/master/api-keys.html).';
  const auth = createOption('--auth <auth>', apiDocsLink).env(
    'SYNTHETICS_API_KEY'
  );

  const authMandatory = createOption('--auth <auth>', apiDocsLink)
    .env('SYNTHETICS_API_KEY')
    .makeOptionMandatory(true);

  const configOpt = createOption(
    '-c, --config <path>',
    'configuration path (default: synthetics.config.js)'
  );

  return {
    auth,
    authMandatory,
    params,
    playwrightOpts,
    pattern,
    configOpt,
  };
}

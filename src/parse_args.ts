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

import { program, Option } from 'commander';
import { CliArgs } from './common_types';
import { reporters } from './reporters';
import { DEFAULT_NETWORK_CONDITIONS_ARG } from './helpers';

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { name, version } = require('../package.json');

program
  .name(`npx ${name}`)
  .usage('[options] [dir] [files] file')
  .option(
    '-c, --config <path>',
    'configuration path (default: synthetics.config.js)'
  )
  .option(
    '-p, --params <jsonstring>',
    'JSON object that gets injected to all journeys',
    JSON.parse
  )
  .addOption(
    new Option('--reporter <value>', `output repoter format`).choices(
      Object.keys(reporters)
    )
  )
  .option('-d, --debug', 'print debug logs info')
  .option(
    '--pattern <pattern>',
    'RegExp file patterns to search inside directory'
  )
  .option('--inline', 'Run inline journeys from heartbeat')
  .option('-r, --require <modules...>', 'module(s) to preload')
  .option('--no-headless', 'run browser in headful mode')
  .option('--sandbox', 'enable chromium sandboxing', false)
  .option('--rich-events', 'Mimics a heartbeat run')
  .option(
    '--capability <features...>',
    'Enable capabilities through feature flags'
  )
  .addOption(
    new Option('--screenshots [flag]', 'take screenshots at end of each step')
      .choices(['on', 'off', 'only-on-failure'])
      .default('on')
  )
  .option(
    '--dry-run',
    "don't actually execute anything, report only registered journeys"
  )
  .option(
    '--match <name>',
    'run only journeys with a name or tags that matches the glob'
  )
  .option(
    '--tags <name...>',
    'run only journeys with the given tag(s), or globs'
  )
  .option(
    '--outfd <fd>',
    'specify a file descriptor for logs. Default is stdout',
    parseInt
  )
  .option(
    '--ws-endpoint <endpoint>',
    'Browser WebSocket endpoint to connect to'
  )
  .option(
    '--pause-on-error',
    'pause on error until a keypress is made in the console. Useful during development'
  )
  .option(
    '--ignore-https-errors',
    'ignores any HTTPS errors in sites being tested, including ones related to unrecognized certs or signatures. This can be insecure!'
  )
  .option(
    '--quiet-exit-code',
    'always return 0 as an exit code status, regardless of test pass / fail. Only return > 0 exit codes on internal errors where the suite could not be run'
  )
  .addOption(
    new Option(
      '--throttling <d/u/l>',
      'List of options to throttle network conditions for download throughput (d) in megabits/second, upload throughput (u) in megabits/second and latency (l) in milliseconds.'
    ).default(DEFAULT_NETWORK_CONDITIONS_ARG)
  )
  .option('--no-throttling', 'Turns off default network throttling.')
  .option('--playwright-options <jsonstring>', 'JSON object to pass in custom Playwright options for the agent. Options passed will be merged with Playwright options defined in your synthetics.config.js file. Options defined via --playwright-options take precedence.', JSON.parse)
  .version(version)
  .description('Run synthetic tests');

const command = program.parse(process.argv);
const options = command.opts() as CliArgs;

/**
 * Group all events that can be consumed by heartbeat and
 * eventually by the Synthetics UI.
 */
if (options.richEvents) {
  options.reporter = options.reporter ?? 'json';
  options.ssblocks = true;
  options.network = true;
  options.quietExitCode = true;
  options.trace = true;
}

if (options.capability) {
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
  for (const flag of options.capability) {
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

export { options };
export default command;

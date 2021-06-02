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

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { name, version } = require('../package.json');
const allowedCapabilities = ['trace', 'filmstrips', 'metrics'];

program
  .name(`npx ${name}`)
  .usage('[options] [dir] [files] file')
  .option(
    '-c, --config <path>',
    'configuration path (default: synthetics.config.js)'
  )
  .option('-s, --suite-params <jsonstring>', 'suite variables', '{}')
  .option('-e, --environment <envname>', 'e.g. production', 'development')
  .option('-j, --json', 'output newline delimited JSON')
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
  .option('--sandbox', 'enable chromium sandboxing')
  .option('--rich-events', 'Mimics a heartbeat run')
  .addOption(
    new Option(
      '--capabilities <features...>',
      'Enable capabiltiites through feature flags'
    ).choices(allowedCapabilities)
  )
  .option('--screenshots', 'take screenshot for each step')
  .option('--network', 'capture network information for all journeys')
  .option(
    '--dry-run',
    "don't actually execute anything, report only registered journeys"
  )
  .option('--journey-name <name>', 'only run the journey with the given name')
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
  options.screenshots = true;
  options.network = true;
}

if (options.capabilities) {
  /**
   * trace - record chrome trace events(LCP, FCP, CLS, etc.) for all journeys
   * filmstrips - record detailed filmstrips for all journeys
   * metrics - capture performance metrics (DOM Nodes, Heap size, etc.) for each step
   */
  for (const flags of options.capabilities) {
    options[flags] = true;
  }
}

export { options };
export default command;

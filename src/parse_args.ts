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

import { program } from 'commander';

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { name, version } = require('../package.json');
program
  .name(name)
  .usage('[options] [dir] [files] file')
  .option('-s, --suite-params <jsonstring>', 'Variables', '{}')
  .option('-e, --environment <envname>', 'e.g. production', 'development')
  .option('-j, --json', 'output newline delimited JSON')
  .option('-d, --debug', 'print debug logs info')
  .option(
    '--pattern <pattern>',
    'RegExp file patterns to search inside directory'
  )
  .option('--inline', 'Run inline journeys from heartbeat')
  .option('-r, --require <modules...>', 'module(s) to preload')
  .option('--no-headless', 'run browser in headful mode')
  .option(
    '--pause-on-error',
    'pause on error until a keypress is made in the console. Useful during development'
  )
  .option(
    '--screenshots',
    'take screenshots between steps (only shown in some reporters)'
  )
  .option('--network', 'capture all network information for all steps')
  .option('--metrics', 'capture performance metrics for each step')
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
  .version(version)
  .description('Run synthetic tests');

export const parseArgs = () => {
  program.parse(process.argv);
  return program;
};

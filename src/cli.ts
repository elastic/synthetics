#!/usr/bin/env node

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
import { cwd } from 'process';
import { CliArgs, PushOptions } from './common_types';
import { reporters } from './reporters';
import { normalizeOptions, parseThrottling } from './options';
import { loadTestFiles } from './loader';
import { run } from './';
import { runner } from './core';
import { SyntheticsLocations } from './dsl/monitor';
import {
  push,
  loadSettings,
  validateSettings,
  catchIncorrectSettings,
} from './push';
import {
  formatLocations,
  getLocations,
  renderLocations,
  LocationCmdOptions,
} from './locations';
import { resolve } from 'path';
import { Generator } from './generator';
import { error } from './helpers';
import { LocationsMap } from './locations/public-locations';

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
  .option(
    '--pattern <pattern>',
    'RegExp file patterns to search inside directory'
  )
  .option('--inline', 'Run inline journeys from heartbeat')
  .option('-r, --require <modules...>', 'module(s) to preload')
  .option('--no-headless', 'run browser in headful mode')
  .option('--sandbox', 'enable chromium sandboxing')
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
    '--tags <name...>',
    'run only journeys with a tag that matches the glob'
  )
  .option(
    '--match <name>',
    'run only journeys with a name or tag that matches the glob'
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
  .option(
    '--throttling <config>',
    'JSON object to throttle network conditions for download and upload throughput in megabits/second and latency in milliseconds. Ex: { "download": 10, "upload": 5, "latency": 200 }.',
    parseThrottling,
    {}
  )
  .option('--no-throttling', 'Turns off default network throttling.')
  .option(
    '--playwright-options <jsonstring>',
    'JSON object to pass in custom Playwright options for the agent. Options passed will be merged with Playwright options defined in your synthetics.config.js file. Options defined via --playwright-options take precedence.',
    JSON.parse
  )
  .version(version)
  .description('Run synthetic tests')
  .action(async (cliArgs: CliArgs) => {
    try {
      await loadTestFiles(cliArgs, program.args);
      const options = normalizeOptions(cliArgs);
      const results = await run(options);
      /**
       * Exit with error status if any journey fails
       */
      if (!options.quietExitCode) {
        for (const result of Object.values(results)) {
          if (result.status === 'failed') {
            process.exit(1);
          }
        }
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

// Push command
program
  .command('push')
  .description(
    'Push journeys in the current directory to create monitors within the Kibana monitor management UI'
  )
  .requiredOption(
    '--auth <auth>',
    'API key used for Kibana authentication(https://www.elastic.co/guide/en/kibana/master/api-keys.html).'
  )
  .option(
    '--pattern <pattern>',
    'RegExp file patterns to push inside current directory'
  )
  .option(
    '--tags <name...>',
    'push only journeys with a tag that matches the glob'
  )
  .option(
    '--match <name>',
    'push only journeys with a name or tag that matches the glob'
  )
  .option(
    '--schedule <time-in-minutes>',
    "schedule in minutes for the pushed monitors. Setting `10`, for example, configures monitors which don't have an interval defined to run every 10 minutes.",
    parseInt
  )
  .addOption(
    new Option(
      '--locations <locations...>',
      'default list of locations from which your monitors will run.'
    ).choices(SyntheticsLocations)
  )
  .addOption(
    new Option(
      '--private-locations <locations...>',
      'default list of private locations from which your monitors will run.'
    )
  )
  .option('--url <url>', 'kibana URL to upload the monitors')
  .option(
    '--project <id>',
    'id that will be used for logically grouping monitors'
  )
  .option(
    '--space <space>',
    'the target Kibana spaces for the pushed monitors — spaces help you organise pushed monitors.'
  )
  .action(async (cmdOpts: PushOptions) => {
    try {
      const settings = await loadSettings();
      await loadTestFiles({ inline: false }, [cwd()]);
      const options = normalizeOptions({
        ...program.opts(),
        ...settings,
        ...cmdOpts,
      }) as PushOptions;
      validateSettings(options);
      await catchIncorrectSettings(settings, options);
      const monitors = runner.buildMonitors(options);
      await push(monitors, options);
    } catch (e) {
      e && console.error(e);
      process.exit(1);
    }
  });

// Init command
program
  .command('init [dir]')
  .description('Initialize Elastic synthetics project')
  .action(async (dir = '') => {
    try {
      console.log(dir);
      const generator = await new Generator(resolve(process.cwd(), dir));
      await generator.setup();
    } catch (e) {
      e && error(e);
      process.exit(1);
    }
  });

// Locations command
program
  .command('locations')
  .description(
    `List all locations to run the synthetics monitors. Pass optional '--url' and '--auth' to list private locations.`
  )
  .option('--url <url>', 'Kibana URL to fetch all public and private locations')
  .option(
    '--auth <auth>',
    'API key used for Kibana authentication(https://www.elastic.co/guide/en/kibana/master/api-keys.html).'
  )
  .action(async (cmdOpts: LocationCmdOptions) => {
    try {
      let locations = Object.keys(LocationsMap);
      if (cmdOpts.auth && cmdOpts.url) {
        const allLocations = await getLocations(cmdOpts);
        locations = formatLocations(allLocations);
      }
      renderLocations(locations);
    } catch (e) {
      e && error(e);
      process.exit(1);
    }
  });

program.parse(process.argv);

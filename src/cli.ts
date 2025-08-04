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
import { bold } from 'kleur/colors';
import { resolve } from 'path';
import { CliArgs, PushOptions } from './common_types';
import { reporters } from './reporters';
import {
  normalizeOptions,
  parseThrottling,
  getCommonCommandOpts,
} from './options';
import { globalSetup } from './loader';
import { run } from './';
import { runner } from './core/globals';
import { SyntheticsLocations } from './dsl/monitor';
import { push, loadSettings, validatePush, warnIfThrottled } from './push';
import {
  formatLocations,
  getLocations,
  renderLocations,
  LocationCmdOptions,
} from './locations';
import { Generator } from './generator';
import { error, write } from './helpers';
import { LocationsMap } from './locations/public-locations';
import { createLightweightMonitors } from './push/monitor';
import { getVersion } from './push/kibana_api';
import { installTransform } from './core/transform';
import { totp, TOTPCmdOptions } from './core/mfa';
import { setGlobalProxy } from './helpers';

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { name, version } = require('../package.json');

const {
  params,
  pattern,
  playwrightOpts,
  auth,
  authMandatory,
  configOpt,
  tags,
  match,
  fields,
  proxyToken,
  proxyUri,
  proxyNoVerify,
  proxyCa,
  proxyCert,
} = getCommonCommandOpts();

program
  .name(`npx ${name}`)
  .usage('[options] [dir] [files] file')
  .addOption(configOpt)
  .addOption(pattern)
  .addOption(tags)
  .addOption(match)
  .addOption(params)
  .addOption(
    new Option('--reporter <value>', `output reporter format`).choices(
      Object.keys(reporters)
    )
  )
  .option('--inline', 'read journeys from stdin instead of reading from files')
  .option('-r, --require <modules...>', 'module(s) to preload')
  .option('--sandbox', 'enable chromium sand-boxing')
  .option(
    '--rich-events',
    'preset flag used when running monitors directly via Heartbeat'
  )
  .option('--no-headless', 'run with the browser in headful mode')
  .option(
    '--capability <features...>',
    'Enable capabilities through feature flags'
  )
  .addOption(
    new Option(
      '--screenshots [flag]',
      'Control whether to capture screenshots at the end of each step'
    ).choices(['on', 'off', 'only-on-failure'])
  )
  .option(
    '--dry-run',
    "don't actually execute anything, report only registered journeys"
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
    parseThrottling
  )
  .option(
    '--no-throttling',
    'Turns off default network throttling.',
    parseThrottling
  )
  .addOption(playwrightOpts)
  .version(version)
  .description('Run synthetic tests')
  .action(async (cliArgs: CliArgs) => {
    const tearDown = await globalSetup(cliArgs, program.args);
    try {
      const options = await normalizeOptions(cliArgs, 'run');
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
    } finally {
      tearDown();
    }
  });

// Push command
program
  .command('push')
  .description(
    'Push all journeys in the current directory to create monitors within the Kibana monitor management UI'
  )
  .addOption(authMandatory)
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
  .option(
    '--private-locations <locations...>',
    'default list of private locations from which your monitors will run.'
  )
  .option('--url <url>', 'Kibana URL to upload the project monitors')
  .option(
    '--id <id>',
    'project id that will be used for logically grouping monitors'
  )
  .option(
    '--space <space>',
    'the target Kibana spaces for the pushed monitors — spaces help you organise pushed monitors.'
  )
  .option('-y, --yes', 'skip all questions and run non-interactively')
  .addOption(proxyUri)
  .addOption(proxyToken)
  .addOption(proxyNoVerify)
  .addOption(proxyCa)
  .addOption(proxyCert)
  .addOption(pattern)
  .addOption(tags)
  .addOption(fields)
  .addOption(match)
  .addOption(params)
  .addOption(playwrightOpts)
  .addOption(configOpt)
  .action(async cmdOpts => {
    cmdOpts = { ...cmdOpts, ...program.opts() };
    const workDir = cwd();
    const tearDown = await globalSetup({ inline: false, ...cmdOpts }, [
      workDir,
    ]);
    try {
      const settings = await loadSettings(cmdOpts.config);
      const options = (await normalizeOptions(
        {
          ...settings,
          ...cmdOpts,
        },
        'push'
      )) as PushOptions;

      //Set up global proxy agent if any of the related options are set
      setGlobalProxy(
        options.proxyUri,
        options.proxyToken,
        options.proxyNoVerify ? false : true,
        options.proxyCa,
        options.proxyCert
      );

      await validatePush(options, settings);
      const monitors = runner._buildMonitors(options);
      if ((options as CliArgs).throttling == null) {
        warnIfThrottled(monitors);
      }
      options.kibanaVersion = await getVersion(options);
      monitors.push(...(await createLightweightMonitors(workDir, options)));
      await push(monitors, options);
    } catch (e) {
      e && console.error(e);
      process.exit(1);
    } finally {
      tearDown();
    }
  });

// Init command
program
  .command('init [dir]')
  .description('Initialize Elastic synthetics project')
  .action(async (dir = '') => {
    try {
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
  .addOption(auth)
  .addOption(proxyUri)
  .addOption(proxyToken)
  .addOption(proxyNoVerify)
  .addOption(proxyCa)
  .addOption(proxyCert)
  .action(async (cmdOpts: LocationCmdOptions) => {
    const revert = installTransform();
    const url = cmdOpts.url ?? (await loadSettings(null, true))?.url;
    try {
      // Set up global proxy agent if any of the related options are set
      setGlobalProxy(
        cmdOpts.proxyUri,
        cmdOpts.proxyToken,
        cmdOpts.proxyNoVerify ? false : true,
        cmdOpts.proxyCa,
        cmdOpts.proxyCert
      );
      if (url && cmdOpts.auth) {
        const allLocations = await getLocations({
          url,
          auth: cmdOpts.auth,
        });
        renderLocations(formatLocations(allLocations));
      } else {
        renderLocations({ publicLocations: Object.keys(LocationsMap) });
      }
    } catch (e) {
      e && error(e);
      process.exit(1);
    } finally {
      revert();
    }
  });

// TOTP command
program
  .command('totp <secret>')
  .description(
    'Generate a Time-based One-Time token using the provided secret.'
  )
  .option(
    '--issuer <issuer>',
    'Provider or Service the secret is associated with.'
  )
  .option('--label <label>', 'Account Identifier (default: SyntheticsTOTP)')
  .action((secret, cmdOpts: TOTPCmdOptions) => {
    try {
      const token = totp(secret, cmdOpts);
      write(bold(`OTP Token: ${token}`));
    } catch (e) {
      error(e);
      process.exit(1);
    }
  });

program.parse(process.argv);

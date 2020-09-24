#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createInterface as createReadlineInterface } from 'readline';
import { journey, step } from './core';
import { debug } from './helpers';
import { run } from './';
import { parseArgs } from './parse_args';

const readStdin = async () => {
  let source = '';
  const rl = createReadlineInterface({ input: process.stdin });
  rl.on('line', line => {
    source += line + '\n';
  });

  return new Promise<string>(resolve => {
    rl.on('close', () => {
      resolve(source);
    });
  });
};

const program = parseArgs();

const loadInlineScript = (source, suiteParams) => {
  const scriptFn = new Function('step', 'suiteParams', 'console', source);
  journey('inline', async () => {
    debug('Creating steps for inline journey');
    scriptFn.apply(null, [step, suiteParams, console]);
  });
};

const suiteParams = JSON.parse(program.suiteParams);
const filePath = program.args[0];
const singleMode = program.stdin || filePath;
/**
 * use JSON reporter if json flag is enabled
 */
const reporter = program.json ? 'json' : 'default';
/**
 * Set debug based on flag
 */
process.env.DEBUG = program.debug || '';

(async () => {
  if (singleMode) {
    const source = program.stdin
      ? await readStdin()
      : readFileSync(filePath, 'utf8');
    debug('Running single script...' + source.toString());
    loadInlineScript(source, suiteParams);
  }

  await run({
    params: suiteParams,
    environment: program.environment,
    reporter,
    headless: program.headless,
    screenshots: program.screenshots,
    screenshotFormat: program.screenshotFormat,
    dryRun: program.dryRun,
    journeyName: program.journeyName,
    network: program.network,
    pauseOnError: program.pauseOnError,
    outfd: program.outfd,
    metrics: program.metrics,
  });
})();

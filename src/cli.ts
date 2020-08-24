#!/usr/bin/env node

import program from 'commander';
import { readFileSync } from 'fs';
import { createInterface as createReadlineInterface } from 'readline';
import { runner, journey, step } from './dsl';
import { debug } from './helpers';

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

const loadInlineScript = (source, suiteParams) => {
  const scriptFn = new Function('step', 'suiteParams', 'console', source);
  journey('inline', async () => {
    debug('Creating steps for inline journey');
    scriptFn.apply(null, [step, suiteParams, console]);
  });
};

program
  /* eslint-disable @typescript-eslint/no-var-requires */
  .version(require('../package.json').version)
  .usage('[options] <file>')
  .option('-s, --suite-params <jsonstring>', 'Variables', '{}')
  .option('-e, --environment <envname>', 'e.g. production', 'development')
  .option('-j, --json', 'output newline delimited JSON')
  .option('--stdin', 'read script file input from stdin')
  .option('-d, --debug', 'print debug information')
  .option('--headless', 'run browser in headless mode')
  .option(
    '--screenshots',
    'take screenshots between steps (only shown in some reporters)'
  )
  .description('Run Synthetic tests');

program.parse(process.argv);

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
const debugFlag = (process.env.DEBUG = program.debug || '');

(async () => {
  if (singleMode) {
    const source = program.stdin
      ? await readStdin()
      : readFileSync(filePath, 'utf8');
    debug('Running single script...' + source.toString());
    loadInlineScript(source, suiteParams);
  }

  try {
    await runner.run({
      params: suiteParams,
      environment: program.environment,
      reporter,
      debug: debugFlag,
      headless: program.headless,
      screenshots: program.screenshots
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
})();

#!/usr/bin/env node

import program from 'commander';
import { readFileSync } from 'fs';
import { createInterface as createReadlineInterface } from 'readline';
import { runner, journey, step } from './dsl';
import { debug } from './helpers';
import { RunOptions } from './dsl/runner';
import commander from 'commander';

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
  .option('--headless', "run browser in headless mode")
  .option('--screenshots', "take screenshots between steps (only shown in some reporters)")
  .option('--dry-run', "don't actually execute anything, report as if each step was skipped")
  .option('--journey-name <name>', "only run the journey with the given name")
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
process.env.DEBUG = program.debug || '';

export { program } from 'commander';

export const run = async (options: RunOptions) => {
  if (singleMode) {
    const source = program.stdin
      ? await readStdin()
      : readFileSync(filePath, 'utf8');
    debug('Running single script...' + source.toString());
    loadInlineScript(source, suiteParams);
  }

  try {
    await runner.run({
      params: {...options.params, ...suiteParams},
      environment: program.environment || options.environment,
      reporter,
      headless: program.headless,
      screenshots: program.screenshots,
      dryRun: program.dryRun,
      journeyName: program.journeyName
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
};

// Check if we're being called via npx or node this_script, if so run the CLI opts
// If being used as a library do nothing
if (require.main === module) {
  run({params: {}, environment: "development"})
}

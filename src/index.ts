import { runner } from './core';
import { RunOptions } from './core/runner';
import { parseArgs } from './parse_args';

/* eslint-disable @typescript-eslint/no-var-requires */
require('source-map-support').install();

export async function run(options: RunOptions) {
  /**
   * Use the NODE_ENV variable to control the environment if its not explicity
   * passed from either CLI or through the API
   */
  options.environment = options.environment || process.env['NODE_ENV'];

  const cliArgs = parseArgs();
  try {
    await runner.run({
      ...options,
      headless: options.headless ?? cliArgs.headless,
      screenshots: options.screenshots ?? cliArgs.screenshots,
      dryRun: options.dryRun ?? cliArgs.dryRun,
      journeyNames: options.journeyNames ?? cliArgs.journeyName,
      journeyTags: options.journeyTags ?? cliArgs.journeyTags,
      network: options.network ?? cliArgs.network,
      pauseOnError: options.pauseOnError ?? cliArgs.pauseOnError,
      outfd: options.outfd ?? cliArgs.outfd,
      reporter: cliArgs.json && !options.reporter ? 'json' : options.reporter,
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export { journey, step } from './core';

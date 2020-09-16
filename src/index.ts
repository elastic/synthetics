import { runner } from './dsl';
import { RunOptions } from './dsl/runner';
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
      journeyName: options.journeyName ?? cliArgs.journeyName,
      network: options.network ?? cliArgs.network,
      pauseOnError: options.pauseOnError ?? cliArgs.pauseOnError,
      outfd: options.outfd ?? cliArgs.outfd,
      reporter: options.reporter ?? cliArgs.json,
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export * from './dsl';

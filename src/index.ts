import { runner } from './core';
import { RunOptions } from './core/runner';
import { setLogger } from './core/logger';
import { parseArgs } from './parse_args';

/* eslint-disable @typescript-eslint/no-var-requires */
require('source-map-support').install();

export async function run(options: RunOptions) {
  const cliArgs = parseArgs();
  /**
   * Use the NODE_ENV variable to control the environment if its not explicity
   * passed from either CLI or through the API
   */
  options.environment = options.environment || process.env['NODE_ENV'];
  /**
   * set up logger with appropriate file descriptor
   * to capture all the DEBUG logs when running from heartbeat
   */
  const outfd = options.outfd ?? cliArgs.outfd;
  setLogger(outfd);

  try {
    await runner.run({
      ...options,
      headless: options.headless ?? cliArgs.headless,
      screenshots: options.screenshots ?? cliArgs.screenshots,
      dryRun: options.dryRun ?? cliArgs.dryRun,
      journeyName: options.journeyName ?? cliArgs.journeyName,
      network: options.network ?? cliArgs.network,
      pauseOnError: options.pauseOnError ?? cliArgs.pauseOnError,
      reporter: cliArgs.json && !options.reporter ? 'json' : options.reporter,
      outfd,
    });
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export { beforeAll, afterAll, journey, step, before, after } from './core';

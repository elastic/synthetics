import { runner } from './dsl';
import { RunOptions } from './dsl/runner';

/* eslint-disable @typescript-eslint/no-var-requires */
require('source-map-support').install();

export async function run(options: RunOptions) {
  /**
   * Use the NODE_ENV variable to control the environment if its not explicity
   * passed from either CLI or through the API
   */
  options.environment = options.environment || process.env['NODE_ENV'];

  try {
    await runner.run(options);
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export * from './dsl';

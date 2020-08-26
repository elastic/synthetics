import { runner } from './dsl';
import { RunOptions } from './dsl/runner';

/* eslint-disable @typescript-eslint/no-var-requires */
require('source-map-support').install();

export async function run(options: RunOptions) {
  try {
    await runner.run(options);
  } catch (e) {
    console.error('Failed to run the test', e);
    process.exit(1);
  }
}

export * from './dsl';

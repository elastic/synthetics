#!/usr/bin/env node

import { stdin, cwd } from 'process';
import { join } from 'path';
import { stat } from 'fs';
import { promisify } from 'util';
import { totalist } from 'totalist';
import { step, journey } from './core';
import { parseArgs } from './parse_args';
import { run } from './';

const program = parseArgs();
const resolvedCwd = cwd();
const statAsync = promisify(stat);
/**
 * Set debug based on flag
 */
process.env.DEBUG = program.debug || '';

const loadInlineScript = source => {
  const scriptFn = new Function('step', 'page', 'browser', 'params', source);
  journey('inline', async ({ page, browser, params }) => {
    scriptFn.apply(null, [step, page, browser, params]);
  });
};

async function readStdin() {
  const chunks = [];
  stdin.resume();
  stdin.setEncoding('utf-8');
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  return chunks.join();
}

function requireSuites(suites: Iterable<string>) {
  for (const suite of suites) {
    require(suite);
  }
}

async function prepareSuites(inputs) {
  const suites = new Set<string>();
  for (const input of inputs) {
    const absPath = join(resolvedCwd, input);
    const stats = await statAsync(absPath);
    if (stats.isDirectory()) {
      await totalist(absPath, (rel, abs) => {
        /**
         * Match all files inside the directory with the
         * mjs, cjs, js, ts extensions
         */
        const pattern = program.pattern
          ? new RegExp(program.pattern, 'i')
          : /.([mc]js|[jt]s?)$/;
        if (pattern.test(rel)) {
          suites.add(abs);
        }
      });
    } else {
      suites.add(absPath);
    }
  }
  return suites.values();
}

(async () => {
  if (program.inline) {
    const source = await readStdin();
    loadInlineScript(source);
  } else if (stdin.isTTY) {
    const suites = await prepareSuites(program.args);
    requireSuites(suites);
  } else {
    /**
     * Handled piped files by reading the STDIN
     * ex: ls example/suites/*.js
     */
    const input = await readStdin();
    const files = input.split('\n').filter(Boolean);
    const suites = await prepareSuites(files);
    requireSuites(suites);
  }

  const suiteParams = JSON.parse(program.suiteParams);
  /**
   * use JSON reporter if json flag is enabled
   */
  const reporter = program.json ? 'json' : 'default';

  await run({
    params: suiteParams,
    environment: program.environment,
    reporter,
    headless: program.headless,
    screenshots: program.screenshots,
    dryRun: program.dryRun,
    journeyName: program.journeyName,
    network: program.network,
    pauseOnError: program.pauseOnError,
    outfd: program.outfd,
    metrics: program.metrics,
  });
})();

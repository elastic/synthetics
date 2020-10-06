#!/usr/bin/env node

import { stdin, cwd } from 'process';
import { join } from 'path';
import { totalist } from 'totalist';
import { step, journey } from './core';
import { run } from './';
import { parseArgs } from './parse_args';

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

function requireSuites(files: Array<string>) {
  for (const file of files) {
    require(file);
  }
}

const program = parseArgs();
const resolvedCwd = cwd();
const suiteParams = JSON.parse(program.suiteParams);
/**
 * use JSON reporter if json flag is enabled
 */
const reporter = program.json ? 'json' : 'default';
/**
 * Set debug based on flag
 */
process.env.DEBUG = program.debug || '';

(async () => {
  if (program.dir) {
    const dir = join(resolvedCwd, program.dir || '.');
    const suites = [];
    await totalist(dir, (rel, abs) => {
      if (/\.js$/.test(rel)) {
        suites.push(abs);
      }
    });
    requireSuites(suites);
  } else if (program.inline) {
    const source = await readStdin();
    loadInlineScript(source);
  } else {
    /**
     * Handled piped content by reading the STDIN
     */
    const input = stdin.isTTY ? program.args : await readStdin();
    const suites = [];
    const files = Array.isArray(input)
      ? input
      : input.split('\n').filter(file => file);
    for (const file of files) {
      const absPath = join(resolvedCwd, file);
      suites.push(absPath);
    }
    requireSuites(suites);
  }

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

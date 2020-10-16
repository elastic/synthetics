#!/usr/bin/env node

import { stdin, cwd } from 'process';
import { resolve } from 'path';
import { stat } from 'fs';
import { promisify } from 'util';
import { totalist } from 'totalist';
import { step, journey } from './core';
import { log } from './core/logger';
import { parseArgs } from './parse_args';
import { isDepInstalled } from './helpers';
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

/**
 * Handle both directory and files that are passed through TTY
 * and add them to suites
 */
async function prepareSuites(inputs: string[]) {
  const suites = new Set<string>();
  const addSuite = absPath => {
    log(`Processing file: ${absPath}`);
    suites.add(require.resolve(absPath));
  };
  /**
   * Match all files inside the directory with the
   * .journey.{mjs|cjs|js|ts) extensions
   */
  const pattern = program.pattern
    ? new RegExp(program.pattern, 'i')
    : /.journey.([mc]js|[jt]s?)$/;
  for (const input of inputs) {
    const absPath = resolve(resolvedCwd, input);
    const stats = await statAsync(absPath);
    if (stats.isDirectory()) {
      await totalist(absPath, (rel, abs) => {
        if (pattern.test(rel)) {
          addSuite(abs);
        }
      });
    } else {
      addSuite(absPath);
    }
  }
  return suites.values();
}

(async () => {
  if (program.inline) {
    const source = await readStdin();
    loadInlineScript(source);
  } else {
    /**
     * Preload modules before running the suites
     * we support `.ts` files out of the box by invoking
     * the `ts-node/register` which only compiles TS files
     */
    const modules = ['ts-node/register']
      .concat(program.require || [])
      .filter(Boolean);
    for (const name of modules) {
      if (isDepInstalled(name)) {
        require(name);
      } else {
        throw new Error(`cannot find module '${name}'`);
      }
    }
    /**
     * Handled piped files by reading the STDIN
     * ex: ls example/suites/*.js | npx @elastic/synthetics
     */
    const input = stdin.isTTY ? program.args : await readStdin();
    const files = Array.isArray(input)
      ? input
      : input.split('\n').filter(Boolean);
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
})().catch(e => {
  console.error(e);
  process.exit(1);
});

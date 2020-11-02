#!/usr/bin/env node

/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { stdin, cwd } from 'process';
import { resolve } from 'path';
import { step, journey } from './core';
import { log } from './core/logger';
import { parseArgs } from './parse_args';
import {
  findPkgJsonByTraversing,
  isDepInstalled,
  isDirectory,
  totalist,
} from './helpers';
import { run } from './';

const program = parseArgs();
const resolvedCwd = cwd();
/**
 * Set debug based on DEBUG ENV and -d flags
 * namespace - synthetics
 */
const namespace = 'synthetics';
process.env.DEBUG =
  process.env.DEBUG === namespace || (program.debug ? program.debug : '');

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
    : /.+\.journey\.([mc]js|[jt]s?)$/;
  /**
   * Ignore node_modules by default when running suites
   */
  const ignored = /node_modules/i;

  for (const input of inputs) {
    const absPath = resolve(resolvedCwd, input);
    /**
     * Validate for package.json file before running
     * the suites
     */
    await findPkgJsonByTraversing(absPath, resolvedCwd);
    if (await isDirectory(absPath)) {
      await totalist(absPath, (rel, abs) => {
        if (pattern.test(rel) && !ignored.test(rel)) {
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
     * the `ts-node` via `transpile-only` mode which only compiles
     *  TS files without doing any extensive type checks
     */
    const modules = ['ts-node/register/transpile-only']
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
    const files =
      program.args.length > 0
        ? program.args
        : (await readStdin()).split('\n').filter(Boolean);
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

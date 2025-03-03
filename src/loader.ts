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
import { extname, resolve } from 'path';
import { CliArgs } from './common_types';
import { step, journey } from './core';
import { log } from './core/logger';
import { expect } from './core/expect';
import * as mfa from './core/mfa';
import {
  isDepInstalled,
  isDirectory,
  totalist,
  findPkgJsonByTraversing,
} from './helpers';
import { installTransform } from './core/transform';

const resolvedCwd = cwd();
const JOURNEY_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs'];

/**
 * Perform global setup process required for running the test suites
 * and also for bundling the monitors. The process includes
 * - Transpiling the TS/JS test files
 * - Loading these files for running test suites
 */
export async function globalSetup(options: CliArgs, args: string[]) {
  const revert = installTransform();
  await loadTestFiles(options, args);
  return () => {
    revert();
  };
}

export async function loadTestFiles(options: CliArgs, args: string[]) {
  /**
   * Preload modules before running the tests
   */
  const modules = [].concat(options.require || []).filter(Boolean);
  for (const name of modules) {
    if (isDepInstalled(name)) {
      require(name);
    } else {
      throw new Error(`cannot find module '${name}'`);
    }
  }

  if (options.inline) {
    const source = await readStdin();
    loadInlineScript(source);
    return;
  }
  /**
   * Handle piped files by reading the STDIN
   * ex: ls example/suites/*.js | npx @elastic/synthetics
   */
  const files =
    args.length > 0 ? args : (await readStdin()).split('\n').filter(Boolean);
  const suites = await prepareSuites(files, options.pattern);
  requireSuites(suites);
}

const loadInlineScript = source => {
  const scriptFn = new Function(
    'step',
    'page',
    'context',
    'browser',
    'params',
    'expect',
    'request',
    'mfa',
    source
  );
  journey('inline', ({ page, context, browser, params, request }) => {
    scriptFn.apply(null, [
      step,
      page,
      context,
      browser,
      params,
      expect,
      request,
      mfa,
    ]);
  });
};

/**
 * Read the input from STDIN and run it as inline journey
 */
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
    require(suite); // Use a correct relative path for each suite
  }
}

/**
 * Handle both directory and files that are passed through TTY
 * and add them to suites
 */
async function prepareSuites(inputs: string[], filePattern?: string) {
  const suites = new Set<string>();
  const addSuite = absPath => {
    if (!JOURNEY_EXTENSIONS.includes(extname(absPath))) {
      return;
    }
    log(`Processing file: ${absPath}`);
    suites.add(require.resolve(absPath));
  };
  /**
   * Match all files inside the directory with the
   * .journey.{mjs|cjs|js|ts) extensions
   */
  const pattern = filePattern
    ? new RegExp(filePattern, 'i')
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
    findPkgJsonByTraversing(absPath, resolvedCwd);
    if (isDirectory(absPath)) {
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

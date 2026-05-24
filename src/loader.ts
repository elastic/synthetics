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
import { extname, resolve, join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync } from 'fs';
import Module from 'module';
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

/**
 * Detects whether the inline source is a full ES/CJS module — typical of
 * scripts authored against the public DSL (e.g. `apiJourney`/`journey` with
 * an explicit `import { ... } from '@elastic/synthetics'`) — versus the
 * legacy inline form, which is a bare set of statements that rely on
 * `step`, `page`, `params`, `expect`, `request`, and `mfa` being injected as
 * locals inside an implicit `journey('inline', ...)` wrapper.
 */
const isModuleInlineSource = (source: string): boolean => {
  if (/^\s*(?:import|export)\b/m.test(source)) {
    return true;
  }
  if (/\b(?:apiJourney|journey)\s*\(/.test(source)) {
    return true;
  }
  return false;
};

const loadInlineScript = (source: string) => {
  if (isModuleInlineSource(source)) {
    loadInlineModule(source);
    return;
  }
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

const SYNTHETICS_PKG_ROOT = resolve(__dirname, '..');
let syntheticsAliasInstalled = false;

/**
 * Make `require('@elastic/synthetics')` (and subpath requires) resolvable
 * from any file path on disk. The inline module is materialised in a
 * temp directory whose ancestors may not contain a `node_modules` entry
 * for `@elastic/synthetics` (e.g. an OS `tmpdir`, a `npm link`ed dev
 * checkout, or a globally installed CLI). Patching `_resolveFilename`
 * once aliases the bare specifier and its subpaths to this package on
 * disk so the temp module loads the same code that is currently running.
 */
const installSyntheticsRequireAlias = () => {
  if (syntheticsAliasInstalled) return;
  syntheticsAliasInstalled = true;
  const PKG = '@elastic/synthetics';
  const ModuleInternal = Module as unknown as {
    _resolveFilename: (
      request: string,
      parent: NodeModule,
      isMain?: boolean,
      options?: Record<string, unknown>
    ) => string;
  };
  const originalResolve = ModuleInternal._resolveFilename;
  ModuleInternal._resolveFilename = function (
    request,
    parent,
    isMain,
    options
  ) {
    if (request === PKG || request.startsWith(`${PKG}/`)) {
      const subpath = request === PKG ? '' : request.slice(PKG.length + 1);
      const aliased = subpath
        ? join(SYNTHETICS_PKG_ROOT, subpath)
        : SYNTHETICS_PKG_ROOT;
      return originalResolve.call(this, aliased, parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
};

/**
 * Load a self-contained inline module by materialising it as a TypeScript
 * file and `require`ing it. The transform hook installed by
 * `installTransform()` (esbuild, `format: 'cjs'`) takes care of ESM → CJS
 * rewriting, so `import { apiJourney } from '@elastic/synthetics'`
 * resolves through the normal `require` chain and the script registers
 * its `apiJourney`/`journey` via the DSL on import, without being wrapped
 * in an implicit browser journey.
 */
const loadInlineModule = (source: string) => {
  installSyntheticsRequireAlias();
  const dir = mkdtempSync(join(tmpdir(), 'synthetics-inline-'));
  const file = join(dir, 'inline.journey.ts');
  writeFileSync(file, source);
  require(file);
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
    require(suite);
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

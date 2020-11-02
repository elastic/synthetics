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

import { red, green, yellow, cyan } from 'kleur/colors';
import os from 'os';
import { resolve, join, dirname } from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { performance } from 'perf_hooks';

const statAsync = promisify(fs.lstat);
const readAsync = promisify(fs.readdir);
const SEPARATOR = '\n';

export function noop() {}

export function indent(lines: string, tab = '   ') {
  return lines.replace(/^/gm, tab);
}

export const symbols = {
  warning: yellow('⚠'),
  skipped: cyan('-'),
  succeeded: green('✓'),
  failed: red('✖'),
};

export function generateTempPath() {
  return join(os.tmpdir(), `synthetics-${process.hrtime().toString()}`);
}

/**
 * As per the timings used in the Network Events from
 * Chrome devtools protocol
 */
export function getMonotonicTime() {
  const hrTime = process.hrtime();
  return hrTime[0] * 1 + hrTime[1] / 1e9;
}

/**
 * Timestamp at which the current node process began.
 */
const processStart = performance.timeOrigin;
export function getTimestamp() {
  return (processStart + now()) * 1000;
}

/**
 * Relative current time from the start of the current node process
 */
export function now() {
  return performance.now();
}

/**
 * Execute all the callbacks in parallel using Promise.all
 */
export async function runParallel(callbacks) {
  const promises = callbacks.map(cb => cb());
  return await Promise.all(promises);
}

export function isDepInstalled(dep) {
  try {
    return require.resolve(dep);
  } catch (e) {
    return false;
  }
}

export async function isDirectory(path) {
  return (await statAsync(path)).isDirectory();
}

export async function isFile(filePath) {
  return fs.existsSync(filePath) && (await statAsync(filePath)).isFile();
}

/**
 * Traverse the directory tree up from the cwd until we find
 * package.json file to check if the user is invoking our script
 * from an NPM project.
 */
export async function findPkgJsonByTraversing(resolvePath, cwd) {
  const packageJSON = resolve(resolvePath, 'package.json');
  if (await isFile(packageJSON)) {
    return packageJSON;
  }
  const parentDirectory = dirname(resolvePath);
  /**
   * We are in the system root and package.json does not exist
   */
  if (resolvePath === parentDirectory) {
    throw red(
      `Could not find package.json file in: "${cwd}"\n` +
        `It is recommended to run the agent in an NPM project.\n` +
        `You can create one by running "npm init -y" in the project folder.`
    );
  }
  return findPkgJsonByTraversing(parentDirectory, cwd);
}

/**
 * Modified version of `totalist` package that handles the symlink issue
 * and avoids infinite recursion
 *
 * Based on code from totalist!
 * https://github.com/lukeed/totalist/blob/44379974e535afe9c38e8d643dd64c59101a14b9/src/async.js#L8
 */
export async function totalist(
  dir: string,
  callback: (relPath: string, absPath: string) => any,
  pre = ''
) {
  dir = resolve('.', dir);
  await readAsync(dir).then(arr => {
    return Promise.all(
      arr.map(str => {
        const abs = join(dir, str);
        return statAsync(abs).then(stats =>
          stats.isDirectory()
            ? totalist(abs, callback, join(pre, str))
            : callback(join(pre, str), abs)
        );
      })
    );
  });
}

/**
 * Find index of Playwright specific Error logs that is thrown
 * as part of the custom error message/stack
 */
export function findPWLogsIndexes(msgOrStack: string): [number, number] {
  let startIndex = 0;
  let endIndex = 0;
  if (!msgOrStack) {
    return [startIndex, endIndex];
  }
  const lines = String(msgOrStack).split(SEPARATOR);
  const logStart = /[=]{3,} logs [=]{3,}/;
  const logEnd = /[=]{10,}/;
  lines.forEach((line, index) => {
    if (logStart.test(line)) {
      startIndex = index;
    } else if (logEnd.test(line)) {
      endIndex = index;
    }
  });
  return [startIndex, endIndex];
}

export function rewriteErrorMessage(message: string, start: number) {
  if (start === 0) {
    return message;
  }
  return message.split(SEPARATOR).slice(0, start).join(SEPARATOR);
}

export function rewriteErrorStack(stack: string, indexes: [number, number]) {
  const [start, end] = indexes;
  /**
   * Do not rewrite if its not a playwright error
   */
  if (start === 0 && end === 0) {
    return stack;
  }
  const linesToKeep = start + 3;
  if (start > 0 && linesToKeep < end) {
    const lines = stack.split(SEPARATOR);
    return lines
      .slice(0, linesToKeep)
      .concat(...lines.slice(end))
      .join(SEPARATOR);
  }
  return stack;
}

export function formatError(error: Error) {
  if (!(error instanceof Error)) {
    return;
  }
  const { name, message, stack } = error;
  const indexes = findPWLogsIndexes(message);
  return {
    name,
    message: rewriteErrorMessage(message, indexes[0]),
    stack: rewriteErrorStack(stack, indexes),
  };
}

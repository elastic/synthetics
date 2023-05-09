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

import { red, green, yellow, cyan, bold, grey } from 'kleur/colors';
import os from 'os';
import { resolve, join, dirname } from 'path';
import fs from 'fs';
import { lstat, readdir } from 'fs/promises';
import { performance } from 'perf_hooks';
import sourceMapSupport from 'source-map-support';
import {
  HooksArgs,
  HooksCallback,
  NetworkConditions,
  Location,
  ThrottlingOptions,
} from './common_types';
import micromatch from 'micromatch';

const SEPARATOR = '\n';

export function noop() {}

export function indent(lines: string, tab = '   ') {
  return lines.replace(/^/gm, tab);
}

/**
 *  Disable unicode symbols for windows, the underlying
 *  FS stream has a known issue in windows
 */
const NO_UTF8_SUPPORT = process.platform === 'win32';
export const symbols = {
  warning: yellow(NO_UTF8_SUPPORT ? '!' : '⚠'),
  skipped: cyan('-'),
  progress: cyan('>'),
  succeeded: green(NO_UTF8_SUPPORT ? 'ok' : '✓'),
  failed: red(NO_UTF8_SUPPORT ? 'x' : '✖'),
};

export function generateUniqueId() {
  return `${Date.now() + Math.floor(Math.random() * 1e13)}`;
}

export function generateTempPath() {
  return join(os.tmpdir(), `synthetics-${generateUniqueId()}`);
}

/**
 * Get Monotonically increasing time in seconds since
 * an arbitrary point in the past.
 *
 * We internally use the monotonically increasing clock timing
 * similar to the chrome devtools protocol network events for
 * journey,step start/end fields to make querying in the UI easier
 */
export function monotonicTimeInSeconds() {
  const hrTime = process.hrtime(); // [seconds, nanoseconds]
  return hrTime[0] * 1 + hrTime[1] / 1e9;
}

/**
 * Converts the trace events timestamp field from microsecond
 * resolution to monotonic seconds timestamp similar to other event types (journey, step, etc)
 * Reference - https://github.com/samccone/chrome-trace-event/blob/d45bc8af3b5c53a3adfa2c5fc107b4fae054f579/lib/trace-event.ts#L21-L22
 *
 * Tested and verified on both Darwin and Linux
 */
export function microSecsToSeconds(ts: number) {
  return ts / 1e6;
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
 * Execute all the hooks callbacks in parallel using Promise.all
 */
export async function runParallel(
  callbacks: Array<HooksCallback>,
  args: HooksArgs
) {
  const promises = callbacks.map(cb => cb(args));
  return await Promise.all(promises);
}

export function isDepInstalled(dep) {
  try {
    return require.resolve(dep);
  } catch (e) {
    return false;
  }
}

export function isDirectory(path) {
  return fs.existsSync(path) && fs.statSync(path).isDirectory();
}

export function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Traverse the directory tree up from the cwd until we find
 * package.json file to check if the user is invoking our script
 * from an NPM project.
 */
export function findPkgJsonByTraversing(resolvePath, cwd) {
  const packageJSON = resolve(resolvePath, 'package.json');
  if (isFile(packageJSON)) {
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
  await readdir(dir).then(arr => {
    return Promise.all(
      arr.map(str => {
        const abs = join(dir, str);
        return lstat(abs).then(stats =>
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

// formatError prefers receiving proper Errors, but since at runtime
// non Error exceptions can be thrown, it tolerates though. The
// redundant type Error | any expresses that.
export function formatError(error: Error | any) {
  if (error === undefined || error === null) {
    return;
  }

  if (!(error instanceof Error)) {
    return {
      message: `Error "${error}" received, with type "${typeof error}". (Do not throw exceptions without using \`new Error("my message")\`)`,
      name: '',
      stack: '',
    };
  }
  const { name, message, stack } = error;
  const indexes = findPWLogsIndexes(message);
  return {
    name,
    message: rewriteErrorMessage(message, indexes[0]),
    stack: rewriteErrorStack(stack, indexes),
  };
}

const cwd = process.cwd();
/**
 * All the settings that are related to the Synthetics is stored
 * under this directory
 * Examples: Screenshots, Project setup
 */
export const SYNTHETICS_PATH = join(cwd, '.synthetics');
/**
 * Synthetics cache path that is based on the process id to make sure
 * each process does not modify the caching layer used by other process
 * once we move to executing journeys in parallel
 */
export const CACHE_PATH = join(SYNTHETICS_PATH, process.pid.toString());

export function getDurationInUs(duration: number) {
  return Math.trunc(duration * 1e6);
}

export function megabitsToBytes(megabytes: number) {
  return (megabytes * 1024 * 1024) / 8;
}

export const DEFAULT_THROTTLING_OPTIONS: ThrottlingOptions = {
  download: 5,
  upload: 3,
  latency: 20,
};

/**
 * Transforms the CLI throttling arguments in to format
 * expected by Chrome devtools protocol NetworkConditions
 */
export function getNetworkConditions(
  throttlingOpts: ThrottlingOptions
): NetworkConditions {
  return {
    downloadThroughput: megabitsToBytes(throttlingOpts.download),
    uploadThroughput: megabitsToBytes(throttlingOpts.upload), // Devtools CDP expects format to be in bytes/second
    latency: throttlingOpts.latency, // milliseconds,
    offline: false,
  };
}

export const THROTTLING_WARNING_MSG = `Throttling may not be active when the tests run - see
https://github.com/elastic/synthetics/blob/main/docs/throttling.md for more details`;

const dstackTraceLimit = 10;

// Uses the V8 Stacktrace API to get the function location
// information - https://v8.dev/docs/stack-trace-api#customizing-stack-traces
export function wrapFnWithLocation<A extends unknown[], R>(
  func: (location: Location, ...args: A) => R
): (...args: A) => R {
  return (...args) => {
    const _prepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stackFrames) => {
      // Deafult CallSite would not map to the original transpiled source
      // correctly, So we use source-map-support to map the CallSite to the
      // original source from our cached source map
      const frame: NodeJS.CallSite = sourceMapSupport.wrapCallSite(
        stackFrames[1]
      );
      return {
        file: frame.getFileName(),
        line: frame.getLineNumber(),
        column: frame.getColumnNumber(),
      };
    };
    Error.stackTraceLimit = 2;
    const obj: { stack: Location } = {} as any;
    Error.captureStackTrace(obj);
    const location = obj.stack;
    Error.stackTraceLimit = dstackTraceLimit;
    Error.prepareStackTrace = _prepareStackTrace;
    return func(location, ...args);
  };
}

// Safely parse ND JSON (Newline delimitted JSON) chunks
export function safeNDJSONParse(data: string | string[]) {
  // data may not be at proper newline boundaries, so we make sure everything is split
  // on proper newlines
  const chunks = Array.isArray(data) ? data : [data];
  const lines = chunks.join('\n').split(/\r?\n/);
  return lines
    .filter(l => l.match(/\S/)) // remove blank lines
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        throw `Error ${e} could not parse data '${line}'`;
      }
    });
}

// Console helpers
export function write(message: string, live?: boolean) {
  process.stderr.write(message + (live ? '\r' : '\n'));
}

export function progress(message: string) {
  write(cyan(bold(`${symbols.progress} ${message}`)));
}

export async function liveProgress(promise: Promise<any>, message: string) {
  const start = now();
  const interval = setInterval(() => {
    apiProgress(`${message} (${Math.trunc(now() - start)}ms)`, true);
  }, 500);
  promise.finally(() => clearInterval(interval));
  const result = await promise;
  apiProgress(`${message} (${Math.trunc(now() - start)}ms)`);
  return result;
}

export function apiProgress(message: string, live = false) {
  write(grey(`> ${message}`), live);
}

export function error(message: string) {
  write(red(message));
}

export function done(message: string) {
  write(bold(green(`${symbols['succeeded']} ${message}`)));
}

export function warn(message: string) {
  write(bold(yellow(`${symbols['warning']} ${message}`)));
}

export function removeTrailingSlash(url = '') {
  return url.replace(/\/+$/, '');
}

export function getMonitorManagementURL(url) {
  return removeTrailingSlash(url) + '/app/uptime/manage-monitors/all';
}

/**
 * Matches tests based on the provided args. Proitize tags over match
 * - tags pattern that matches only tags
 * - match pattern that matches both name and tags
 */
export function isMatch(
  tags: Array<string>,
  name: string,
  tagsPattern?: Array<string>,
  matchPattern?: string
) {
  if (tagsPattern) {
    return tagsMatch(tags, tagsPattern);
  }
  if (matchPattern) {
    return (
      micromatch.isMatch(name, matchPattern) || tagsMatch(tags, matchPattern)
    );
  }
  return true;
}

export function tagsMatch(tags, pattern) {
  const matchess = micromatch(tags || ['*'], pattern);
  return matchess.length > 0;
}

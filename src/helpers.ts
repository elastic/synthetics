import { red, green, yellow, cyan } from 'kleur/colors';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { performance } from 'perf_hooks';

const statAsync = promisify(fs.stat);

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

export function formatError(error: Error) {
  if (!(error instanceof Error)) {
    return;
  }
  const { name, message, stack } = error;
  return { name, message, stack };
}

export function generateTempPath() {
  return path.join(os.tmpdir(), `synthetics-${process.hrtime().toString()}`);
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
  const packageJSON = path.resolve(resolvePath, 'package.json');
  if (await isFile(packageJSON)) {
    return packageJSON;
  }
  const parentDirectory = path.dirname(resolvePath);
  /**
   * We are in the system root and package.json does not exist
   */
  if (resolvePath === parentDirectory) {
    throw red(
      `Could not find package.json file in: ${cwd}\n` +
        `It is recommended to run the agent in an NPM project.`
    );
  }
  return findPkgJsonByTraversing(parentDirectory, cwd);
}

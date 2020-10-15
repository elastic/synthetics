import { red, green, yellow, cyan } from 'kleur/colors';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';

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

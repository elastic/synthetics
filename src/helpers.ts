import { red, green, yellow, grey, cyan } from 'kleur';
import os from 'os';
import path from 'path';

export function debug(message: string) {
  if (process.env.DEBUG) {
    process.stdout.write(grey(message + '\n'));
  }
}

export function indent(lines: string, tab = '   ') {
  return lines.replace(/^/gm, tab);
}

export const symbols = {
  warning: yellow('⚠'),
  skipped: cyan('-'),
  succeeded: green('✓'),
  failed: red('✖'),
};

export function getMilliSecs(startTime: [number, number]) {
  // [seconds, nanoseconds]
  const hrTime = process.hrtime(startTime);
  return Math.trunc(hrTime && hrTime[0] * 1e3 + hrTime[1] / 1e6);
}

export function formatError(error: Error) {
  if (!(error instanceof Error)) {
    return;
  }
  const { name, message, stack } = error;
  return { name, message, stack };
}

/**
 * As per the timings used in the Network Events from
 * Chrome devtools protocol
 */
export function getMonotonicTime() {
  const hrTime = process.hrtime();
  return hrTime[0] * 1 + hrTime[1] / 1e9;
}

export function generateTempPath() {
  return path.join(os.tmpdir(), `synthetics-${process.hrtime().toString()}`);
}

export function getTimestamp() {
  return Date.now() * 1000;
}

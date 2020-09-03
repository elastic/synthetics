import { red, green, yellow, grey, cyan } from 'kleur';

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
  failed: red('✖')
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

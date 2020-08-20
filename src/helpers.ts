import { red, green, yellow, grey } from 'kleur';

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
  pass: green('✓'),
  fail: red('✖')
};

export function getMilliSecs(startTime: [number, number]) {
  // [seconds, nanoseconds]
  const hrTime = process.hrtime(startTime);
  return Math.trunc(hrTime && hrTime[0] * 1e3 + hrTime[1] / 1e6);
}

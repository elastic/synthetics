import SonicBoom from 'sonic-boom';
import Runner from '../dsl/runner';
import { Writable } from 'stream';
import { green, red, cyan } from 'kleur';
import { symbols, indent, getMilliSecs } from '../helpers';

export type ReporterOptions = {
  fd?: number;
  colors?: boolean;
};

function renderError(error) {
  let output = '';
  const outer = indent('');
  const inner = indent(outer);
  output += outer + '---\n';
  const stack = error.stack;
  if (stack) {
    const lines = String(stack).split('\n');
    output += inner + 'stack: |-\n';
    for (const line of lines) {
      output += inner + '  ' + line + '\n';
    }
  }
  output += indent(outer + '---\n');
  return output;
}

export default class BaseReporter {
  stream: Writable;
  constructor(public runner: Runner, public options: ReporterOptions = {}) {
    this.runner = runner;
    this.stream = new SonicBoom({ fd: options.fd || process.stdout.fd });
    /**
     * Destroy stream once data is written and run
     * it as the last listener giving enough room for
     * other reporters to write to stream
     */
    this.runner.on('end', () => {
      process.nextTick(() => this.stream.end());
    });

    this._registerListeners();
  }

  _registerListeners() {
    const result = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      start: process.hrtime(),
    };
    this.runner.on('start', () => {
      result.start = process.hrtime();
    });

    this.runner.on('journey:start', ({ journey }) => {
      this.write(`\nJourney: ${journey.options.name}`);
    });

    this.runner.on('step:end', ({ step, durationMs, error, status }) => {
      const message = `${symbols[status]}  Step: '${step.name}' ${status} (${durationMs} ms)`;
      this.write(indent(message));
      error && this.write(renderError(error));
      result[status]++;
    });

    this.runner.on('end', () => {
      const { failed, succeeded, start, skipped } = result;
      let message = '\n';
      message += succeeded > 0 ? green(` ${succeeded} passed`) : '';
      message += failed > 0 ? red(` ${failed} failed`) : '';
      message += skipped > 0 ? cyan(` ${skipped} skipped`) : '';
      message += ` (${getMilliSecs(start)} ms) \n`;
      this.write(message);
    });
  }

  write(message) {
    if (typeof message == 'object') {
      message = '\n' + JSON.stringify(message);
    }
    this.stream.write(message + '\n');
  }
}

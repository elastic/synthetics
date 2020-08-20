import SonicBoom from 'sonic-boom';
import Runner from '../dsl/runner';
import { Writable } from 'stream';
import { green, red } from 'kleur';
import { symbols, indent, getMilliSecs } from '../helpers';

type ReporterOptions = {
  fd?: Writable;
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
  output += indent(outer + '...\n');
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
      total: 0,
      passed: 0,
      start: process.hrtime()
    };
    this.runner.on('start', ({ numJourneys }) => {
      result.total = numJourneys;
      result.start = process.hrtime();
    });

    this.runner.on('journey:start', ({ journey }) => {
      this.write(`\nJourney: ${journey.options.name}`);
    });

    this.runner.on('step:end', ({ step, elapsedMs, error }) => {
      let message = '';
      if (error) {
        message += indent(
          `${symbols.fail} Step: '${step.name}' failed (${elapsedMs} ms) \n`
        );
        message += renderError(error);
      } else {
        message += indent(
          `${symbols.pass} Step: '${step.name}' succeeded (${elapsedMs} ms)`
        );
      }
      this.write(message);
    });

    this.runner.on('journey:end', ({ error }) => {
      if (!error) {
        result.passed++;
      }
    });

    this.runner.on('end', () => {
      const { passed, total, start } = result;
      const failedCount = total - passed;
      const failed = failedCount > 0 ? red(` ${failedCount} failed`) : '';
      this.write(
        `\n${green(passed + ' passed')}${failed} (${getMilliSecs(start)} ms)\n`
      );
    });
  }

  write(message) {
    if (typeof message == 'object') {
      message = JSON.stringify(message);
    }
    this.stream.write(message + '\n');
  }
}

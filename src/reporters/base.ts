import SonicBoom from 'sonic-boom';
import Runner from '../core/runner';
import { green, red, cyan } from 'kleur/colors';
import { symbols, indent, now } from '../helpers';

export type ReporterOptions = {
  fd?: number;
  colors?: boolean;
};

function renderError(error) {
  let output = '';
  const outer = indent('');
  const inner = indent(outer);
  const container = outer + '---\n';
  output += container;
  const stack = error.stack;
  if (stack) {
    const lines = String(stack).split('\n');
    output += inner + 'stack: |-\n';
    for (const line of lines) {
      output += inner + '  ' + line + '\n';
    }
  }
  output += container;
  return output;
}

function renderDuration(durationMs) {
  return parseInt(durationMs);
}

export default class BaseReporter {
  stream: SonicBoom;
  fd: number;
  constructor(public runner: Runner, public options: ReporterOptions = {}) {
    this.runner = runner;
    this.fd = options.fd || process.stdout.fd;
    this.stream = new SonicBoom({ fd: this.fd });
    this._registerListeners();
    this.runner.on('end', () => this.close());
  }

  close() {
    if (this.fd <= 2) {
      /**
       * For stdout/stderr we destroy stream once data is written and run
       * it as the last listener giving enough room for
       * other reporters to write to stream
       */
      process.nextTick(() => this.stream.end());
    } else {
      /**
       * If the user has passed a custom FD we don't close the FD, but we do flush it
       * to give them more control. This is important because FDs should only be closed
       * once, and the primary use case for custom FDs is being called by heartbeat, which
       * closes the FD after the process exits
       */
      this.stream.flush();
    }
  }

  _registerListeners() {
    const result = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    this.runner.on('journey:start', ({ journey }) => {
      this.write(`\nJourney: ${journey.options.name}`);
    });

    this.runner.on('step:end', ({ step, start, end, error, status }) => {
      const message = `${symbols[status]}  Step: '${
        step.name
      }' ${status} (${renderDuration((end - start) * 1000)} ms)`;
      this.write(indent(message));
      error && this.write(renderError(error));
      result[status]++;
    });

    this.runner.on('end', () => {
      const { failed, succeeded, skipped } = result;
      const total = failed + succeeded + skipped;
      if (total === 0) return;
      let message = '\n';
      message += succeeded > 0 ? green(` ${succeeded} passed`) : '';
      message += failed > 0 ? red(` ${failed} failed`) : '';
      message += skipped > 0 ? cyan(` ${skipped} skipped`) : '';
      message += ` (${renderDuration(now())} ms) \n`;
      this.write(message);
    });
  }

  write(message) {
    if (typeof message == 'object') {
      message = JSON.stringify(message);
    }
    this.stream.write(message + '\n');
  }
}

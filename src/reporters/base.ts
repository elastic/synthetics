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

import SonicBoom from 'sonic-boom';
import { green, red, cyan, gray } from 'kleur/colors';
import { codeFrameColumns } from '@babel/code-frame';
import StackUtils from 'stack-utils';
import { fileURLToPath } from 'url';
import { resolve, sep } from 'path';
import {
  symbols,
  indent,
  now,
  findPWLogsIndexes,
  rewriteErrorStack,
} from '../helpers';
import { Reporter, ReporterOptions } from '.';
import {
  JourneyEndResult,
  JourneyStartResult,
  StepEndResult,
  TestError,
  Location,
} from '../common_types';
import { Journey, Step } from '../dsl';
import { readFileSync } from 'fs';

const stackUtils = new StackUtils({ internals: StackUtils.nodeInternals() });

function prepareStackLine(
  line: string
): (Location & { function?: string }) | null {
  const frame = stackUtils.parseLine(line);
  if (!frame) {
    return null;
  }
  // ignore node internals
  if (frame.file?.startsWith('internal') || frame.file?.startsWith('node:')) {
    return null;
  }

  // handle relative URLs
  const file = frame.file?.startsWith('file://')
    ? fileURLToPath(frame.file)
    : resolve(process.cwd(), frame.file);

  // ignore node_modules
  if (file.includes(`${sep}node_modules${sep}`)) {
    return null;
  }

  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
    function: frame.function,
  };
}

function prepareLocation(stack: string) {
  const lines = stack.split('\n');
  let startAt = lines.findIndex(line => line.startsWith('    at '));
  if (startAt === -1) startAt = lines.length;
  const message = lines.slice(0, startAt).join('\n');
  const stackLines = lines.slice(startAt);
  // figure out the location of the journey/step that throws the error
  let location: Location | undefined;
  let stackLine: string;
  for (const line of stackLines) {
    const frame = prepareStackLine(line);
    if (!frame || !frame.file) continue;
    location = {
      file: frame.file,
      column: frame.column || 0,
      line: frame.line || 0,
    };
    stackLine = line;
    break;
  }

  return {
    message,
    stackLine,
    location,
  };
}

function highLightSource(location: Location): string {
  if (!location) {
    return;
  }

  try {
    const source = readFileSync(location.file, 'utf-8');
    const frame = codeFrameColumns(
      source,
      { start: location },
      {
        highlightCode: true,
      }
    );
    return frame;
  } catch (_) {
    // ignore error
  }
}

function renderError(error: TestError) {
  const { message, stackLine, location } = prepareLocation(error.stack);
  let outer = indent('');
  outer += '\n' + outer + message + '\n\n';
  outer += highLightSource(location) + '\n\n';
  outer += gray(stackLine) + '\n';
  return outer;
  // let output = '';
  // const outer = indent('');
  // const inner = indent(outer);
  // const container = outer + '---\n';
  // output += container;
  // let stack = error.stack;
  // if (stack) {
  //   output += inner + 'stack: |-\n';
  //   stack = rewriteErrorStack(stack, findPWLogsIndexes(stack));
  //   const lines = String(stack).split('\n');
  //   for (const line of lines) {
  //     output += inner + '  ' + line + '\n';
  //   }
  // }
  // output += container;
  // return red(output);
}

function renderDuration(durationMs) {
  return parseInt(durationMs);
}

export default class BaseReporter implements Reporter {
  stream: SonicBoom;
  fd: number;
  dryRun: boolean;
  metrics = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
    registered: 0,
  };

  constructor(options: ReporterOptions = {}) {
    this.fd = options.fd || process.stdout.fd;
    this.dryRun = options.dryRun ?? false;
    /**
     * minLength is set to 1 byte to make sure we flush the
     * content even if its the last byte on the stream buffer
     * before destroying the pipe with underlying file descriptor
     */
    this.stream = new SonicBoom({ fd: this.fd, sync: true, minLength: 1 });
  }

  onJourneyRegister(journey: Journey): void {
    this.write(`\nJourney: ${journey.name}`);
    this.metrics.registered++;
  }

  onJourneyStart(journey: Journey, {}: JourneyStartResult) {
    this.write(`\nJourney: ${journey.name}`);
  }

  onStepEnd(_: Journey, step: Step, result: StepEndResult) {
    const { status, end, start, error } = result;
    const message = `${symbols[status]}  Step: '${step.name}' ${status} ${gray(
      '(' + renderDuration((end - start) * 1000) + ' ms)'
    )}`;
    this.write(indent(message));
    error && this.write(renderError(error));
    this.metrics[status]++;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  onJourneyEnd(_: Journey, { error }: JourneyEndResult) {
    const { failed, succeeded, skipped } = this.metrics;
    const total = failed + succeeded + skipped;
    /**
     * Render the error on the terminal only when no steps could
     * be executed which means the error happened in one of the hooks
     */
    if (total === 0 && error) {
      this.write(renderError(error));
    }
  }

  onEnd() {
    const { failed, succeeded, skipped, registered } = this.metrics;
    const total = failed + succeeded + skipped;

    if (this.dryRun) {
      this.write(`\n${registered} journey(s) registered`);
      return;
    }

    let message = '\n';
    if (total === 0) {
      message = 'No tests found!';
      message += ` (${renderDuration(now())} ms) \n`;
      this.write(message);
      return;
    }

    message += succeeded > 0 ? green(` ${succeeded} passed`) : '';
    message += failed > 0 ? red(` ${failed} failed`) : '';
    message += skipped > 0 ? cyan(` ${skipped} skipped`) : '';
    message += ` (${renderDuration(now())} ms) \n`;
    this.write(message);

    // flushSync is used here to make sure all the data from the underlying
    // SonicBoom stream buffer is completely written to the fd before closing
    // the process
    this.stream.flushSync();
  }

  write(message) {
    if (typeof message == 'object') {
      message = JSON.stringify(message);
    }
    this.stream.write(message + '\n');
  }
}

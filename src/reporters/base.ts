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
import { green, red, cyan } from 'kleur/colors';
import {
  symbols,
  indent,
  now,
  findPWLogsIndexes,
  rewriteErrorStack,
  CACHE_PATH,
} from '../helpers';
import { Reporter, ReporterOptions } from '.';
import {
  JourneyEndResult,
  JourneyStartResult,
  StepEndResult,
} from '../common_types';
import { Journey, Step } from '../dsl';
import path, { join } from 'path';
import fs from 'fs';
import { gatherScreenshots } from './utils';

function renderError(error) {
  let output = '';
  const outer = indent('');
  const inner = indent(outer);
  const container = outer + '---\n';
  output += container;
  let stack = error.stack;
  if (stack) {
    output += inner + 'stack: |-\n';
    stack = rewriteErrorStack(stack, findPWLogsIndexes(stack));
    const lines = String(stack).split('\n');
    for (const line of lines) {
      output += inner + '  ' + line + '\n';
    }
  }
  output += container;
  return red(output);
}

function renderDuration(durationMs) {
  return parseInt(durationMs);
}

export default class BaseReporter implements Reporter {
  stream: SonicBoom;
  fd: number;
  metrics = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  constructor({ fd }: ReporterOptions = {}) {
    this.fd = fd || process.stdout.fd;
    /**
     * minLength is set to 1 byte to make sure we flush the
     * content even if its the last byte on the stream buffer
     * before destroying the pipe with underlying file descriptor
     */
    this.stream = new SonicBoom({ fd: this.fd, sync: true, minLength: 1 });
  }

  onJourneyStart(journey: Journey, {}: JourneyStartResult) {
    this.write(`\nJourney: ${journey.name}`);
  }

  onStepEnd({ monitor, name }: Journey, step: Step, result: StepEndResult) {
    const { status, end, start, error } = result;
    const message = `${symbols[status]}  Step: '${
      step.name
    }' ${status} (${renderDuration((end - start) * 1000)} ms)`;
    this.write(indent(message));
    error && this.write(renderError(error));
    const screenshotOpt = monitor.config.screenshot ?? 'on';

    const whenFailed =
      screenshotOpt === 'only-on-failure' && status === 'failed';
    const filePath = path.resolve(`.screenshots/${name}/${step.name}.jpg`);

    if (screenshotOpt === 'on' || whenFailed) {
      this.write(indent(cyan(`  Screenshot: ${filePath}`)));
    }
    this.metrics[status]++;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  async onJourneyEnd(
    { name, monitor }: Journey,
    { error, status }: JourneyEndResult
  ) {
    const { failed, succeeded, skipped } = this.metrics;
    const total = failed + succeeded + skipped;
    /**
     * Render the error on the terminal only when no steps could
     * be executed which means the error happened in one of the hooks
     */
    if (total === 0 && error) {
      this.write(renderError(error));
    }

    await fs.promises.mkdir(`.screenshots/${name}/`, {
      recursive: true,
    });

    await gatherScreenshots(
      join(CACHE_PATH, 'screenshots'),
      async screenshot => {
        const { data, step } = screenshot;
        const screenshotOpt = monitor.config.screenshot ?? 'on';
        const whenFailed =
          screenshotOpt === 'only-on-failure' && status === 'failed';

        if (screenshotOpt === 'on' || whenFailed) {
          await (async () => {
            await fs.promises.writeFile(
              join(`.screenshots/${name}/`, `${step.name}.jpg`),
              data,
              {
                encoding: 'base64',
              }
            );
          })();
        }
      }
    );
  }

  onEnd() {
    const { failed, succeeded, skipped } = this.metrics;
    const total = failed + succeeded + skipped;

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

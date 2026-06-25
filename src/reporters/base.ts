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
import { renderError, serializeError } from './reporter-util';
import { symbols, indent, now } from '../helpers';
import { Reporter, ReporterOptions } from '.';
import { Journey, Step } from '../dsl';
import {
  JourneyEndResult,
  JourneyStartResult,
  StepResult,
} from '../common_types';
import path, { join } from 'path';
import fs from 'fs';

export function renderDuration(durationMs) {
  return parseInt(durationMs);
}

export default class BaseReporter implements Reporter {
  stream: SonicBoom;
  fd: number;
  outputDir: string;
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
    this.outputDir = options.outputDir;
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

  onStepEnd(journey: Journey, step: Step, {}: StepResult) {
    const { status, error } = step;
    const monitor = journey._getMonitor();
    const message = `${symbols[status]}  Step: '${step.name}' ${status} ${gray(
      '(' + renderDuration(step.duration * 1000) + ' ms)'
    )}`;
    this.write(indent(message));
    if (error) {
      const message = renderError(serializeError(error));
      this.write(indent(message) + '\n');
    }
    const screenshotOpt = monitor.config.screenshot ?? 'on';

    const whenFailed =
      screenshotOpt === 'only-on-failure' && status === 'failed';

    const pth = this.outputDir
      ? `${this.outputDir}/${journey.name}`
      : `.screenshots/${journey.name}/`;
    const filePath = path.resolve(`${pth}/${step.name}.jpg`);

    const encodedPath = filePath.replace(/ /g, '%20'); // Encode spaces
    const formattedPath = `\x1b]8;;file://${encodedPath}\x1b\\${filePath}\x1b]8;;\x1b\\`;

    if (screenshotOpt === 'on' || whenFailed) {
      this.write(indent(cyan(`  Screenshot: (${formattedPath})`)));
    }
    this.metrics[status]++;
  }

  async onJourneyEnd(journey: Journey, { attachments }: JourneyEndResult) {
    const { failed, succeeded, skipped } = this.metrics;
    const total = failed + succeeded + skipped;
    /**
     * Render the error on the terminal only when no steps could
     * be executed which means the error happened in one of the hooks
     */
    if (total === 0 && journey.error) {
      const message = renderError(serializeError(journey.error));
      this.write(indent(message) + '\n');
    }

    if (this.outputDir) {
      const basePath = `${this.outputDir}/${journey.name}`;
      await fs.promises.mkdir(basePath, {
        recursive: true,
      });

      for (const attachment of attachments) {
        const { name, body } = attachment;
        await fs.promises.writeFile(join(basePath, `${name}.jpg`), body, {
          encoding: 'base64',
        });
      }
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

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

import { red, green, cyan } from 'kleur/colors';
import { ReporterOptions } from '.';

import * as fs from 'fs';
import { join } from 'path';
import BaseReporter, { renderDuration, renderError } from './base';
import { CACHE_PATH, indent, now, sanitizeFilename, symbols } from '../helpers';
import {
  JourneyEndResult,
  JourneyStartResult,
  ScreenshotOptions,
  StepEndResult,
} from '../common_types';
import { Journey, Step } from '../dsl';
import { gatherScreenshots } from './json';
import Runner from '../core/runner';

export async function writeScreenshotsToPath(
  screenshotOptions: ScreenshotOptions,
  outputDir: string,
  status: StepEndResult['status']
) {
  const FAILED_STEPS_PATH = join(outputDir, 'failed_steps');
  await fs.promises.mkdir(FAILED_STEPS_PATH, { recursive: true });

  await gatherScreenshots(Runner.screenshotPath, async screenshot => {
    const { data, step } = screenshot;
    try {
      const filename = sanitizeFilename(`${step.name}.jpg`);

      if (screenshotOptions === 'on') {
        fs.writeFileSync(join(outputDir, filename), data, {
          encoding: 'base64',
        });
      } else if (
        screenshotOptions === 'only-on-failure' &&
        status === 'failed'
      ) {
        fs.writeFileSync(join(FAILED_STEPS_PATH, filename), data, {
          encoding: 'base64',
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
    }
  });
}

export default class BuildKiteCLIReporter extends BaseReporter {
  screenshotsPath: string;

  journeys: Map<string, Array<StepEndResult & { name: string }>> = new Map();

  constructor(options: ReporterOptions = {}) {
    super(options);
    this.recordVideo = options.recordVideo;
    this.screenshotsPath = join(CACHE_PATH, 'screenshots');
  }

  override onJourneyStart(journey: Journey, {}: JourneyStartResult) {
    this.write(`\n--- Journey: ${journey.name}`);
  }

  override onStepEnd(journey: Journey, step: Step, result: StepEndResult) {
    const { status, end, start, error } = result;
    const message = `${symbols[status]}  Step: '${
      step.name
    }' ${status} (${renderDuration((end - start) * 1000)} ms)`;
    this.write(indent(message));
    if (error) {
      this.write(renderError(error));
    }
    this.metrics[status]++;
    if (!this.journeys.has(journey.name)) {
      this.journeys.set(journey.name, []);
    }
    this.journeys.get(journey.name)?.push({ name: step.name, ...result });
  }

  override async onJourneyEnd(
    journey: Journey,
    { error, start, end, status, options }: JourneyEndResult
  ) {
    const { screenshots, outputDir } = options;
    const { failed, succeeded, skipped } = this.metrics;
    const total = failed + succeeded + skipped;
    if (total === 0 && error) {
      this.write(renderError(error));
    }
    const message = `${symbols[status]} Took  (${renderDuration(
      end - start
    )} seconds)`;
    this.write(message);

    if (outputDir) {
      const FAILED_STEPS_PATH = join(outputDir, 'failed_steps');
      await fs.promises.mkdir(FAILED_STEPS_PATH, { recursive: true });

      await writeScreenshotsToPath(screenshots, outputDir, status);
    }
  }

  override onEnd() {
    const failedJourneys = Array.from(this.journeys.entries()).filter(
      ([, steps]) => steps.some(step => step.status === 'failed')
    );

    if (failedJourneys.length > 0) {
      failedJourneys.forEach(([journeyName, steps]) => {
        const name = red(`Journey: ${journeyName} 🥵`);
        this.write(`\n+++ ${name}`);
        steps.forEach(stepResult => {
          const { status, end, start, error, name: stepName } = stepResult;
          const message = `${
            symbols[status]
          }  Step: '${stepName}' ${status} (${renderDuration(
            (end - start) * 1000
          )} ms)`;
          this.write(indent(message));
          if (error) {
            this.write(renderError(error));
          }
        });
      });
    }

    const successfulJourneys = Array.from(this.journeys.entries()).filter(
      ([, steps]) => steps.every(step => step.status === 'succeeded')
    );

    const dirPath = this.recordVideo?.dir;
    if (dirPath) {
      successfulJourneys.forEach(([journeyName]) => {
        const filePath = join(dirPath, journeyName + '.webm');
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('Failed to delete video file for path ' + filePath);
        }
      });
    }

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
    message += ` (${renderDuration(now() / 1000)} seconds) \n`;
    this.write(message);
  }
}

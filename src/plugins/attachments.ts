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

import { Attachment, Driver, RunOptions, Screenshot } from '../common_types';
import { log } from '../core/logger';
import { Step } from '../dsl';
import { CACHE_PATH, generateUniqueId, getTimestamp } from '../helpers';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

export type AttachmentOptions = {
  outputDir?: string;
  screenshots?: RunOptions['screenshots'];
};

export class AttachmentsManager {
  private attachments: Attachment[] = [];
  #screenshotPath = join(CACHE_PATH, 'screenshots');

  constructor(private driver: Driver, private options: AttachmentOptions) {
    this.#screenshotPath = options.outputDir
      ? join(options.outputDir, 'screenshots')
      : this.#screenshotPath;
  }

  async setup() {
    /**
     * For each journey we create the screenshots folder for
     * caching all screenshots and clear them at end of each journey
     */
    await mkdir(this.#screenshotPath, { recursive: true });
  }

  async clear() {
    // clear screenshots cache after each journey
    await rm(this.#screenshotPath, { recursive: true, force: true });
  }

  async recordScreenshots(step: Step) {
    const { screenshots } = this.options;

    /**
     * Capture screenshot for the newly created pages
     * via popup or new windows/tabs
     *
     * Last open page will get us the correct screenshot
     */
    const pages = this.driver.context.pages();
    const page = pages[pages.length - 1];
    if (page) {
      step.url ??= page.url();
      if (screenshots && screenshots !== 'off') {
        await this.captureScreenshot(page, step);
      }
    }
  }

  private async captureScreenshot(page: Driver['page'], step: Step) {
    try {
      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        timeout: 5000,
      });
      /**
       * Write the screenshot image buffer with additional details (step
       * information) which could be extracted at the end of
       * each journey without impacting the step timing information
       */
      const fileName = `${generateUniqueId()}.json`;
      const screenshot: Screenshot = {
        step,
        timestamp: getTimestamp(),
        data: buffer.toString('base64'),
      };
      await writeFile(
        join(this.#screenshotPath, fileName),
        JSON.stringify(screenshot)
      );
      // we store the screenshot as an image in the output directory
      this.attachments.push({
        name: step.name,
        contentType: 'image/jpeg',
        body: buffer,
      });

      log(`Runner: captured screenshot for (${step.name})`);
    } catch (_) {
      // Screenshot may fail sometimes, log and continue.
      log(`Runner: failed to capture screenshot for (${step.name})`);
    }
  }

  start() {
    log(`Plugins: started collecting attachments`);
  }

  stop() {
    log(`Plugins: stopped collecting attachments`);
    return this.attachments;
  }
}

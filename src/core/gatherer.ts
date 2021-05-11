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

import {
  CDPSession,
  chromium,
  ChromiumBrowser,
  ChromiumBrowserContext,
  Page,
} from 'playwright-chromium';
import { PluginManager } from '../plugins';
import { RunOptions } from './runner';
import { log } from './logger';

export type Driver = {
  browser: ChromiumBrowser;
  context: ChromiumBrowserContext;
  page: Page;
  client: CDPSession;
};

/**
 * Purpose of the Gatherer is to set up the necessary browser driver
 * related capabilities for the runner to run all journeys
 */
export class Gatherer {
  static browser: ChromiumBrowser;

  static async setupDriver(options: RunOptions): Promise<Driver> {
    if (Gatherer.browser == null) {
      const { wsEndpoint, headless, sandbox = false } = options;
      if (wsEndpoint) {
        log(`Gatherer: connecting to WS endpoint: ${wsEndpoint}`);
        Gatherer.browser = await chromium.connect({ wsEndpoint });
      } else {
        Gatherer.browser = await chromium.launch({
          headless,
          chromiumSandbox: sandbox,
        });
      }
    }
    const context = await Gatherer.browser.newContext();
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    return { browser: Gatherer.browser, context, page, client };
  }

  /**
   * Starts recording all events related to the v8 devtools protocol
   * https://chromedevtools.github.io/devtools-protocol/v8/
   */
  static async beginRecording(driver: Driver, options: RunOptions) {
    log('Gatherer: started recording');
    const { filmstrips, network, metrics } = options;
    const pluginManager = new PluginManager(driver);
    pluginManager.start('browserconsole');
    filmstrips && (await pluginManager.start('trace'));
    network && (await pluginManager.start('network'));
    metrics && (await pluginManager.start('performance'));
    return pluginManager;
  }

  static async dispose(driver: Driver) {
    await driver.context.close();
  }

  static async stop() {
    if (Gatherer.browser) {
      await Gatherer.browser.close();
      Gatherer.browser = null;
    }
  }
}

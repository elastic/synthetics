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

import { request as apiRequest } from 'playwright-core';
import { log } from './logger';
import { APIDriver, RunOptions } from '../common_types';
import { APIPluginManager } from '../plugins/api-plugin-manager';

/**
 * Purpose of the Gatherer is to set up the necessary browser driver
 * related capabilities for the runner to run all journeys
 */
export class APIGatherer {
  static pluginManager: APIPluginManager;

  static async setupDriver(options: RunOptions) {
    log('Gatherer: setup browser');
    const { playwrightOptions } = options;

    // Register sig int handler to close the browser
    process.on('SIGINT', async () => {
      await APIGatherer.stop();
      process.exit(130);
    });

    const request = await apiRequest.newContext({ ...playwrightOptions });
    return { request };
  }

  /**
   * Starts recording all events related to the v8 devtools protocol
   * https://chromedevtools.github.io/devtools-protocol/v8/
   */

  static async beginRecording(driver: APIDriver, options: RunOptions) {
    log('Gatherer: started recording');
    const { network, metrics } = options;
    APIGatherer.pluginManager = new APIPluginManager(driver);
    APIGatherer.pluginManager.registerAll(options);
    const plugins = [await APIGatherer.pluginManager.start('browserconsole')];
    network && plugins.push(await APIGatherer.pluginManager.start('network'));
    metrics &&
      plugins.push(await APIGatherer.pluginManager.start('performance'));
    await Promise.all(plugins);
    return APIGatherer.pluginManager;
  }

  static async endRecording() {
    log('Gatherer: ended recording');
    await APIGatherer.pluginManager.unregisterAll();
  }

  static async dispose(driver: APIDriver) {
    log(`Gatherer: closing all contexts`);
    await driver.request.dispose();
  }

  static async stop() {
    log(`Gatherer: closing browser`);
    // if (Gatherer.request) {
    //   await Gatherer.browser.close();
    //   Gatherer.browser = null;
    // }
  }
}

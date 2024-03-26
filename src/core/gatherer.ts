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
  chromium,
  ChromiumBrowser,
  BrowserContext,
  request as apiRequest,
  selectors,
} from 'playwright-core';
import { PluginManager } from '../plugins';
import { log } from './logger';
import { Driver, NetworkConditions, RunOptions } from '../common_types';

// Default timeout for Playwright actions and Navigations
const DEFAULT_TIMEOUT = 50000;

/**
 * Purpose of the Gatherer is to set up the necessary browser driver
 * related capabilities for the runner to run all journeys
 */
export class Gatherer {
  static browser: ChromiumBrowser;

  static async setupDriver(options: RunOptions): Promise<Driver> {
    log('Gatherer: setup driver');
    const { wsEndpoint, playwrightOptions } = options;

    if (Gatherer.browser == null) {
      if (wsEndpoint) {
        log(`Gatherer: connecting to WS endpoint: ${wsEndpoint}`);
        Gatherer.browser = await chromium.connect(wsEndpoint);
      } else {
        Gatherer.browser = await chromium.launch({
          ...playwrightOptions,
          args: [
            ...(playwrightOptions?.headless ? ['--disable-gpu'] : []),
            ...(playwrightOptions?.args ?? []),
          ],
        });
      }
    }
    const context = await Gatherer.browser.newContext({
      ...playwrightOptions,
      userAgent: await Gatherer.getUserAgent(playwrightOptions?.userAgent),
    });
    // Set timeouts for actions and navigations
    context.setDefaultTimeout(
      playwrightOptions?.actionTimeout ?? DEFAULT_TIMEOUT
    );
    context.setDefaultNavigationTimeout(
      playwrightOptions?.navigationTimeout ?? DEFAULT_TIMEOUT
    );

    // TODO: Network throttling via chrome devtools emulation is disabled for now.
    // See docs/throttling.md for more details.
    // Gatherer.setNetworkConditions(context, networkConditions);
    if (playwrightOptions?.testIdAttribute) {
      selectors.setTestIdAttribute(playwrightOptions.testIdAttribute);
    }

    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    const request = await apiRequest.newContext({ ...playwrightOptions });

    // Register sig int handler to close the browser
    process.on('SIGINT', async () => {
      await Gatherer.closeBrowser();
      process.exit(130);
    });
    return { browser: Gatherer.browser, context, page, client, request };
  }

  static async getUserAgent(userAgent?: string) {
    if (!userAgent) {
      const session = await Gatherer.browser.newBrowserCDPSession();
      ({ userAgent } = await session.send('Browser.getVersion'));
      return userAgent + ' Elastic/Synthetics';
    }
    return userAgent;
  }

  static setNetworkConditions(
    context: BrowserContext,
    networkConditions: NetworkConditions
  ) {
    if (networkConditions) {
      context.on('page', page => {
        const context = page.context();
        const emulatePromise = context
          .newCDPSession(page)
          .then(client =>
            client.send('Network.emulateNetworkConditions', networkConditions)
          );
        /**
         * Guard against pages that gets closed before the emulation kicks to capture
         * unhandled rejections from accessing the CDP session of closed page
         */
        Promise.race([
          new Promise<void>(resolve => page.on('close', () => resolve())),
          emulatePromise,
        ]);
      });
    }
  }

  static async closeBrowser() {
    log(`Gatherer: closing browser`);
    if (Gatherer.browser) {
      await Gatherer.browser.close();
      Gatherer.browser = null;
    }
  }

  /**
   * Starts recording all events related to the v8 devtools protocol
   * https://chromedevtools.github.io/devtools-protocol/v8/
   */
  static async beginRecording(driver: Driver, options: RunOptions) {
    log('Gatherer: started recording');
    const { network, metrics, apm } = options;
    const pluginManager = new PluginManager(driver);
    pluginManager.registerAll(options);
    const plugins = [await pluginManager.start('browserconsole')];
    network && plugins.push(await pluginManager.start('network'));
    metrics && plugins.push(await pluginManager.start('performance'));
    apm && plugins.push(await pluginManager.start('apm'));
    await Promise.all(plugins);
    return pluginManager;
  }

  static async dispose(driver: Driver) {
    log(`Gatherer: closing all contexts`);
    await driver.request.dispose();
    await driver.context.close();
  }

  static async stop() {
    await Gatherer.closeBrowser();
  }
}

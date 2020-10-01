import {
  CDPSession,
  chromium,
  ChromiumBrowser,
  ChromiumBrowserContext,
  Page,
} from 'playwright';
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
  static async setupDriver(headless?: boolean): Promise<Driver> {
    log('Gatherer: launching chrome');
    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    return { browser, context, page, client };
  }

  /**
   * Starts recording all events related to the v8 devtools protocol
   * https://chromedevtools.github.io/devtools-protocol/v8/
   */
  static async beginRecording(driver: Driver, options: RunOptions) {
    log('Gatherer: started recording');
    const { screenshots, network, metrics } = options;
    const pluginManager = new PluginManager(driver.client);
    screenshots && (await pluginManager.start('trace'));
    network && (await pluginManager.start('network'));
    metrics && (await pluginManager.start('performance'));
    return pluginManager;
  }

  static async dispose(driver: Driver) {
    await driver.browser.close();
  }
}

import {
  CDPSession,
  chromium,
  ChromiumBrowser,
  ChromiumBrowserContext,
  Page,
} from 'playwright';
import { PluginManager } from '../plugins';
import { RunOptions } from './runner';

export type Driver = {
  browser: ChromiumBrowser;
  context: ChromiumBrowserContext;
  page: Page;
  client: CDPSession;
};

export class Gatherer {
  static async setupDriver(headless: boolean): Promise<Driver> {
    const browser = await chromium.launch({ headless: headless ?? true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    return { browser, context, page, client };
  }

  static async beginRecording(driver: Driver, options: RunOptions) {
    const { screenshots, network, metrics } = options;
    const pluginManager = new PluginManager(driver.client);
    screenshots && (await pluginManager.start('trace'));
    network && (await pluginManager.start('network'));
    metrics && (await pluginManager.start('performance'));
    return pluginManager;
  }
}

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

import { Gatherer } from '../../src/core/gatherer';
import { PluginManager } from '../../src/plugins';
import { wsEndpoint } from '../utils/test-config';
import { devices } from 'playwright-chromium';
import { Server } from '../utils/server';

jest.mock('../../src/plugins/network');

describe('Gatherer', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });

  afterAll(async () => {
    await server.close();
  });

  it('boot and close browser', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    expect(typeof driver.page.goto).toBe('function');
    await Gatherer.stop();
  });

  it('setup and dispose driver', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    await Gatherer.dispose(driver);
    expect(Gatherer.browser).toBeDefined();
    await Gatherer.stop();
    expect(Gatherer.browser).toBeNull();
  });

  it('begin recording based on flags', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const pluginManager = await Gatherer.beginRecording(driver, {
      network: true,
    });
    expect(pluginManager).toBeInstanceOf(PluginManager);
    const network = pluginManager.get('network');
    expect(network.start).toHaveBeenCalled();
    await Gatherer.stop();
  });

  describe('Elastic UA identifier', () => {
    it('works on a single page', async () => {
      const driver = await Gatherer.setupDriver({ wsEndpoint });
      expect(await driver.page.evaluate(() => navigator.userAgent)).toContain(
        ' Elastic/Synthetics'
      );
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('works with device emulation', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        playwrightOptions: { ...devices['Galaxy S9+'] },
      });
      expect(await driver.page.evaluate(() => navigator.userAgent)).toContain(
        ' Elastic/Synthetics'
      );
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('works with popup window', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        playwrightOptions: { ...devices['Galaxy S9+'] },
      });
      const { page, context } = driver;
      await page.goto(server.TEST_PAGE);
      context.on('request', request => {
        expect(request.headers()['user-agent']).toContain(
          ' Elastic/Synthetics'
        );
      });
      await page.setContent(
        '<a target=_blank rel=noopener href="/popup.html">popup</a>'
      );
      const [page1] = await Promise.all([
        context.waitForEvent('page'),
        page.click('a'),
      ]);
      await page1.waitForLoadState();
      expect(await page1.evaluate(() => navigator.userAgent)).toContain(
        ' Elastic/Synthetics'
      );
      expect(await page1.textContent('body')).toEqual('Not found');
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });
  });
});

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
import { megabitsToBytes } from '../../src/helpers';
import { chromium } from 'playwright-chromium';

jest.mock('../../src/plugins/network');

describe('Gatherer', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('boot and close browser', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    expect(typeof driver.page.goto).toBe('function');
    await Gatherer.stop();
  });

  // This test should only run when a browser service is up
  (wsEndpoint ? it : it.skip)(
    'does not the disable-gpu flag to start browser when running headful',
    async () => {
      const chromiumLaunch = jest
        .spyOn(chromium, 'launch')
        .mockImplementation(() => {
          return chromium.connect(wsEndpoint);
        });

      await Gatherer.setupDriver({
        playwrightOptions: { headless: false },
      });
      expect(chromiumLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.not.arrayContaining(['--disable-gpu']),
        })
      );
      await Gatherer.stop();
    }
  );

  // This test should only run when a browser service is up
  (wsEndpoint ? it : it.skip)(
    'uses the disable-gpu flag to start browser when running headlessly',
    async () => {
      const chromiumLaunch = jest
        .spyOn(chromium, 'launch')
        .mockImplementation(() => {
          return chromium.connect(wsEndpoint);
        });

      await Gatherer.setupDriver({
        playwrightOptions: { headless: true },
      });
      expect(chromiumLaunch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--disable-gpu']),
        })
      );
      await Gatherer.stop();
    }
  );

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
    expect(network?.start).toHaveBeenCalled();
    await Gatherer.stop();
  });

  describe('Elastic UA identifier', () => {
    it('present when UA is not overriden', async () => {
      const driver = await Gatherer.setupDriver({ wsEndpoint });
      expect(await driver.page.evaluate(() => navigator.userAgent)).toContain(
        ' Elastic/Synthetics'
      );
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('not present when UA is modified - emulated', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        playwrightOptions: { ...devices['iPhone 12 Pro Max'] },
      });
      const userAgent = await driver.page.evaluate(() => navigator.userAgent);
      expect(userAgent).not.toContain('Elastic/Synthetics');
      expect(userAgent).toContain('iPhone');
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('present on popup windows', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
      });
      const { page, context } = driver;
      await page.goto(server.TEST_PAGE);
      context.on('request', request => {
        expect(request.headers()['user-agent']).toContain('Elastic/Synthetics');
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
        'Elastic/Synthetics'
      );
      expect(await page1.textContent('body')).toEqual('Not found');
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });
  });

  describe('Set Test ID Attribute', () => {
    it('uses default when not set', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
      });
      const { page } = driver;
      await page.goto(server.TEST_PAGE);
      await page.setContent(
        '<a target=_blank rel=noopener href="/popup.html" data-testid="username-button">Click me</a>'
      );
      expect(await page.getByTestId('username-button').isVisible()).toEqual(
        true
      );
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('uses custom when provided', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        playwrightOptions: { testIdAttribute: 'data-test-subj' },
      });
      const { page } = driver;
      await page.goto(server.TEST_PAGE);
      await page.setContent(
        '<a target=_blank rel=noopener href="/popup.html" data-test-subj="username-button">Click me</a>'
      );
      expect(await page.getByTestId('username-button').isVisible()).toEqual(
        true
      );
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });
  });

  describe('Network emulation', () => {
    const networkConditions = {
      downloadThroughput: megabitsToBytes(3),
      uploadThroughput: megabitsToBytes(1),
      latency: 20,
      offline: false,
    };
    it('applies network throttling', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        networkConditions,
      });
      // @ts-ignore
      // Experimental browser API https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/downlink
      const downlink = await driver.page.evaluate(
        () => (navigator['connection'] as any).downlink
      );

      expect(3.5 > downlink && downlink > 2.5).toBe(true);
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('works with popup window', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        networkConditions,
      });
      const { page, context } = driver;
      await page.goto(server.TEST_PAGE);
      await page.setContent(
        '<a target=_blank rel=noopener href="/popup.html">popup</a>'
      );
      const [page1] = await Promise.all([
        context.waitForEvent('page'),
        page.click('a'),
      ]);
      await page1.waitForLoadState();
      // @ts-ignore
      // Experimental browser API https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/downlink
      const downlink = await page1.evaluate(
        () => (navigator['connection'] as any).downlink
      );
      expect(3.5 > downlink && downlink > 2.5).toBe(true);
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });

    it('dont throw for closed popups before load', async () => {
      const driver = await Gatherer.setupDriver({
        wsEndpoint,
        networkConditions,
      });
      const { page, context } = driver;
      await page.goto(server.TEST_PAGE);
      await page.setContent(
        '<a target=_blank rel=noopener href="/popup.html">popup</a>'
      );
      const [page1] = await Promise.all([
        context.waitForEvent('page'),
        page.click('a'),
      ]);
      await page1.close();
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });
  });

  describe('API Request Context', () => {
    it('exposes request', async () => {
      const driver = await Gatherer.setupDriver({ wsEndpoint });
      expect(driver.request).not.toBeNull();
      await Gatherer.dispose(driver);
      await Gatherer.stop();
    });
  });
});

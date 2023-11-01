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
import { BrowserConsole, filterBrowserMessages } from '../../src/plugins';
import { BrowserMessage } from '../../src/common_types';
import { Server } from '../utils/server';
import { wsEndpoint } from '../utils/test-config';

describe('BrowserConsole', () => {
  let server: Server;
  const currentStep = { name: 'test-step', index: 0 };
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture browser console logs', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const browserConsole = new BrowserConsole(driver);
    browserConsole.start();
    browserConsole._currentStep = currentStep;
    await driver.page.evaluate(() => {
      console.warn('console.warn');
      console.error('console.error');
      console.info('console.info');
    });
    await Promise.all([
      driver.page.evaluate(async () => {
        const win = window.open();
        (win as any).console.error('console.error popup');
        (win as any).close();
      }),
      driver.page.context().waitForEvent('console'),
      driver.page.waitForEvent('popup'),
    ]);

    const messages = browserConsole.stop();
    await Gatherer.stop();
    const warnMessage = messages[0];
    expect(warnMessage?.text).toEqual('console.warn');
    expect(warnMessage?.type).toEqual('warning');
    expect(warnMessage?.timestamp).toBeDefined();
    expect(warnMessage?.step).toEqual(currentStep);
    expect(messages.slice(1).map(m => m.text)).toEqual([
      'console.error',
      'console.error popup',
    ]);
  });

  it('should capture browser page errors', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const browserConsole = new BrowserConsole(driver);
    const { page } = driver;
    browserConsole.start();
    await page.goto(server.TEST_PAGE);
    browserConsole._currentStep = currentStep;
    await page.setContent(`
      <img src="imagefound.gif" onError="that.onerror=null;this.src='imagenotfound.gif';">
   `);
    await page.waitForLoadState('networkidle');
    const messages = browserConsole.stop();
    await Gatherer.stop();

    const notFoundMessage = messages.find(
      m => m.text.indexOf('Failed to load resource:') >= 0
    );
    expect(notFoundMessage?.text).toEqual(
      `Failed to load resource: the server responded with a status of 404 (Not Found)`
    );
    expect(notFoundMessage?.type).toEqual('error');
    expect(notFoundMessage?.step).toEqual(currentStep);

    const referenceError = messages.find(
      m => m.text.indexOf('that is not defined') >= 0
    );
    expect(referenceError?.type).toEqual('error');
    expect(referenceError?.step).toEqual(currentStep);
  });

  it('capture unhandled rejections on all pages', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const browserConsole = new BrowserConsole(driver);
    browserConsole.start();
    browserConsole._currentStep = currentStep;
    await driver.page.goto(server.TEST_PAGE);
    await Promise.all([
      driver.context.waitForEvent('weberror'),
      driver.page.setContent(
        `<script>Promise.reject(new Error("Boom"))</script>`
      ),
    ]);
    // throw rejection inside new window
    await Promise.all([
      driver.page.evaluate(async () => {
        const win = window.open();
        Promise.reject('popup error');
        (win as any).close();
      }),
      driver.context.waitForEvent('weberror'),
      driver.page.waitForEvent('popup'),
    ]);
    const messages = browserConsole.stop();
    await Gatherer.stop();

    expect(messages.length).toEqual(2);
    const [page1Err, page2Err] = messages;
    expect(page1Err?.type).toEqual('error');
    expect(page1Err?.step).toEqual(currentStep);
    expect(page2Err?.text).toEqual('popup error');
  });

  describe('Filtering', () => {
    function getBrowserMessages({ errors = 100, warnings = 100, log = 100 }) {
      const messages: BrowserMessage[] = [];
      for (let i = 0; i < errors; i++) {
        messages.push({ type: 'error', text: `error ${i}`, timestamp: 0 });
      }
      for (let i = 0; i < warnings; i++) {
        messages.push({ type: 'warning', text: `warning ${i}`, timestamp: 0 });
      }
      for (let i = 0; i < log; i++) {
        messages.push({ type: 'log', text: `log ${i}`, timestamp: 0 });
      }
      return messages;
    }

    it('skipped journey', () => {
      expect(
        filterBrowserMessages(getBrowserMessages({}), 'skipped').length
      ).toEqual(0);
    });

    it('failed journey', () => {
      expect(
        filterBrowserMessages(getBrowserMessages({}), 'failed').length
      ).toEqual(300);
    });

    it('successful journey', () => {
      expect(
        filterBrowserMessages(
          getBrowserMessages({ errors: 10, warnings: 10, log: 10 }),
          'succeeded'
        ).length
      ).toEqual(30);

      expect(
        filterBrowserMessages(getBrowserMessages({}), 'succeeded').length
      ).toEqual(100);

      const withoutLog = filterBrowserMessages(
        getBrowserMessages({ errors: 10, log: 200 }),
        'succeeded'
      );
      expect(withoutLog.every(msg => msg.type !== 'log')).toBe(true);
      expect(withoutLog.length).toEqual(100);

      const withLog = filterBrowserMessages(
        getBrowserMessages({ errors: 5, warnings: 5 }),
        'succeeded'
      );
      expect(withLog.some(msg => msg.type === 'log')).toBe(true);
      expect(withLog.length).toEqual(100);
    });
  });
});

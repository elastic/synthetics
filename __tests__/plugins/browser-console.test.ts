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
import { BrowserConsole } from '../../src/plugins';
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
    const { page } = driver;
    browserConsole.start();
    await page.goto(server.TEST_PAGE);
    browserConsole._currentStep = currentStep;
    await page.evaluate(() =>
      console.warn('test-message', 1, { test: 'test' })
    );
    const messages = browserConsole.stop();
    await Gatherer.stop();
    const testMessage = messages.find(m => m.text.indexOf('test-message') >= 0);
    expect(testMessage.text).toEqual(`test-message 1 {test: test}`);
    expect(testMessage.type).toEqual('warning');
    expect(testMessage.timestamp).toBeDefined();
    expect(testMessage.step).toEqual(currentStep);
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
    expect(notFoundMessage.text).toEqual(
      `Failed to load resource: the server responded with a status of 404 (Not Found)`
    );
    expect(notFoundMessage.type).toEqual('error');
    expect(notFoundMessage.step).toEqual(currentStep);

    const referenceError = messages.find(
      m => m.text.indexOf('that is not defined') >= 0
    );
    expect(referenceError.error.stack).toContain(
      `ReferenceError: that is not defined\n    at HTMLImageElement.onerror`
    );
    expect(referenceError.type).toEqual('error');
    expect(referenceError.timestamp).toBeDefined();
    expect(referenceError.step).toEqual(currentStep);
  });

  it('should capture unhandled rejections', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const browserConsole = new BrowserConsole(driver);
    browserConsole.start();
    browserConsole._currentStep = currentStep;
    await driver.page.goto(server.TEST_PAGE);
    await driver.page.setContent(
      `<script>Promise.reject(new Error("Boom"))</script>`
    );
    await driver.page.waitForLoadState('networkidle');
    const messages = browserConsole.stop();
    await Gatherer.stop();

    const unhandledError = messages.find(m => m.text.indexOf('Boom') >= 0);
    expect(unhandledError.type).toEqual('error');
    expect(unhandledError.error.stack).toContain('Error: Boom');
    expect(unhandledError.step).toEqual(currentStep);
  });
});

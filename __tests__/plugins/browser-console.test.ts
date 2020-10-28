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
import { Server } from '../../utils/server';

describe('BrowserConsole', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('should capture browser console logs', async () => {
    const driver = await Gatherer.setupDriver();
    const browserConsole = new BrowserConsole(driver.page);
    browserConsole.start();
    await driver.page.goto(server.TEST_PAGE);
    browserConsole.currentStep = { name: 'step-name', index: 0 };
    await driver.page.evaluate(() =>
      console.warn('test-message', 1, { test: 'test' })
    );

    const messages = browserConsole.stop();
    const testMessage = messages.find(m => m.text.indexOf('test-message') >= 0);
    expect(testMessage.text).toEqual('test-message 1 JSHandle@object');
    expect(testMessage.type).toEqual('warning');
    expect(testMessage.timestamp).toBeDefined();
    expect(testMessage.step).toEqual({ name: 'step-name', index: 0 });
    await Gatherer.dispose(driver);
  });
});

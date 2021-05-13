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

import { BrowserService } from '../../src/core/browser-service';
import { Gatherer } from '../../src/core/gatherer';
import { Server } from '../utils/server';

describe('BrowserService', () => {
  let browserService: BrowserService;
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
    browserService = new BrowserService({ port: 9323 });
    browserService.init();
  });
  afterAll(async () => {
    await server.close();
    await browserService.dispose();
  });

  it('should create browser pages', async () => {
    const { page } = await Gatherer.setupDriver({
      wsEndpoint: 'ws://localhost:9323',
    });
    await page.goto(server.TEST_PAGE);
    await Gatherer.stop();
  });
});

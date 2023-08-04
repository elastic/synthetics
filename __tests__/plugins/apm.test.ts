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

import { journey, runner } from '../../src/core';
import { Gatherer } from '../../src/core/gatherer';
import { NetworkManager } from '../../src/plugins';
import { Apm, BAGGAGE_HEADER, TRACE_STATE_HEADER } from '../../src/plugins/apm';
import { Server } from '../utils/server';
import { wsEndpoint } from '../utils/test-config';

describe('apm', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('add baggage header', async () => {
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    // test journey
    runner.addJourney(journey('example-journey', () => {}));
    const network = new NetworkManager(driver);
    const apm = new Apm(driver, { traceUrls: ['**/*'] });
    await network.start();
    await apm.start();

    await driver.page.goto(server.TEST_PAGE);
    await apm.stop();
    const [htmlReq] = await network.stop();
    await Gatherer.stop();

    expect(htmlReq.request.headers[BAGGAGE_HEADER]).toBe(
      `synthetics.monitor.id=example-journey;`
    );
    expect(htmlReq.request.headers[TRACE_STATE_HEADER]).toBe(`es=s:1`);
  });
});

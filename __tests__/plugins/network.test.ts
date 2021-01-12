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
import { NetworkManager } from '../../src/plugins/network';
import { Server } from '../../utils/server';

describe('network', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('capture network info', async () => {
    const driver = await Gatherer.setupDriver();
    const network = new NetworkManager();
    await network.start(driver.client);
    await driver.page.goto(server.TEST_PAGE);
    const netinfo = await network.stop();
    expect(netinfo.length).toBeGreaterThan(0);
    expect(netinfo[0].timings).toMatchObject({
      dns: expect.any(Number),
      total: expect.any(Number),
      wait: expect.any(Number),
      receive: expect.any(Number),
    });
    await Gatherer.dispose(driver);
  });

  it('produce distinct events for redirects', async () => {
    const driver = await Gatherer.setupDriver();
    const network = new NetworkManager();
    await network.start(driver.client);
    /**
     * Set up two level of redirects
     */
    server.setRedirect('/route1', '/route2');
    server.setRedirect('/route2', '/route3');
    server.route('/route3', (req, res) => {
      res.end('route3');
    });
    await driver.page.goto(server.PREFIX + '/route1');
    const netinfo = await network.stop();
    expect(netinfo.length).toEqual(3);
    expect(netinfo[0].status).toBe(302);
    expect(netinfo[1].status).toBe(302);
    expect(netinfo[2].status).toBe(200);
    await Gatherer.dispose(driver);
  });
});

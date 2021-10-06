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
import { Server } from '../utils/server';
import { wsEndpoint } from '../utils/test-config';

describe('network', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  it('should capture network info', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    await driver.page.goto(server.TEST_PAGE, { waitUntil: 'load' });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo[0]).toMatchObject({
      isNavigationRequest: true,
      step: null,
      timestamp: expect.any(Number),
      url: server.TEST_PAGE,
      request: expect.any(Object),
      response: expect.any(Object),
      type: 'document',
      method: 'GET',
      requestSentTime: expect.any(Number),
      status: 200,
      loadEndTime: expect.any(Number),
      responseReceivedTime: expect.any(Number),
      timings: expect.any(Object),
    });
  });

  it('not include data URL in network info', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    await driver.page.goto('data:text/html,<title>Data URI test</title>');
    const netinfo = await network.stop();
    expect(await driver.page.content()).toContain('Data URI test');
    expect(netinfo).toEqual([]);
    await Gatherer.stop();
  });

  it('produce distinct events for redirects', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    /**
     * Set up two level of redirects
     */
    server.setRedirect('/route1', '/route2');
    server.setRedirect('/route2', '/route3');
    server.route('/route3', (req, res) => {
      res.end('route3');
    });
    await driver.page.goto(server.PREFIX + '/route1', {
      waitUntil: 'networkidle',
    });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toEqual(3);
    expect(netinfo[0].status).toBe(302);
    expect(netinfo[1].status).toBe(302);
    expect(netinfo[2].status).toBe(200);
  });

  it('measure resource and transfer size', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    server.route('/route1', (_, res) => {
      res.end('A'.repeat(10));
    });
    await driver.page.goto(server.PREFIX + '/route1');
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo[0]).toMatchObject({
      resourceSize: 0,
      transferSize: 10,
    });
  });

  it('timings for aborted requests', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();

    const delayTime = 20;
    server.route('/abort', async (req, res) => {
      await delay(delayTime);
      res.destroy();
    });
    server.route('/index', async (_, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<script src=${server.PREFIX}/abort />`);
    });

    await driver.page.goto(server.PREFIX + '/index', {
      waitUntil: 'networkidle',
    });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toBe(2);
    expect(netinfo[1]).toMatchObject({
      url: `${server.PREFIX}/abort`,
      status: -1,
      response: {
        statusCode: -1,
        headers: {},
        redirectURL: '',
      },
      timings: expect.any(Object),
    });
    expect(netinfo[1].timings.total).toBeGreaterThan(delayTime);
  });

  it('timings for chunked response', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();

    const delayTime = 100;
    server.route('/chunked', async (req, res) => {
      await delay(delayTime);
      res.writeHead(200, {
        'content-type': 'application/javascript',
      });
      res.write('a');
      await delay(delayTime);
      return res.end('b');
    });
    server.route('/index', async (_, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<script src=${server.PREFIX}/chunked />`);
    });

    await driver.page.goto(server.PREFIX + '/index', {
      waitUntil: 'networkidle',
    });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toBe(2);
    expect(netinfo[1]).toMatchObject({
      url: `${server.PREFIX}/chunked`,
      status: 200,
      response: expect.any(Object),
      timings: expect.any(Object),
    });
    const timings = netinfo[1].timings;
    expect(timings.wait).toBeGreaterThan(delayTime);
    expect(timings.receive).toBeGreaterThan(delayTime);
    expect(timings.total).toBeGreaterThan(timings.wait + timings.receive);
  });
});

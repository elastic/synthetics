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
    await driver.page.goto(server.TEST_PAGE, { waitUntil: 'networkidle' });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toBeGreaterThan(0);
    expect(netinfo[0]).toMatchObject({
      isNavigationRequest: true,
      step: null,
      timestamp: expect.any(Number),
      url: server.TEST_PAGE,
      request: {
        url: server.TEST_PAGE,
        method: 'GET',
        body: {
          bytes: 0,
        },
        bytes: expect.any(Number),
      },
      response: {
        url: server.TEST_PAGE,
        status: 200,
        statusText: 'OK',
        body: {
          bytes: expect.any(Number),
        },
        bytes: expect.any(Number),
      },
      type: 'document',
      requestSentTime: expect.any(Number),
      loadEndTime: expect.any(Number),
      responseReceivedTime: expect.any(Number),
      resourceSize: expect.any(Number),
      transferSize: expect.any(Number),
      timings: expect.any(Object),
    });
  });

  it('not include data URL in network info', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    await driver.page.goto('data:text/html,<title>Data URI test</title>');
    expect(await driver.page.content()).toContain('Data URI test');
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo).toEqual([]);
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
    await driver.page.goto(server.PREFIX + '/route1');
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toEqual(3);
    expect(netinfo[0].response.status).toBe(302);
    expect(netinfo[1].response.status).toBe(302);
    expect(netinfo[2].response.status).toBe(200);
  });

  it('measure resource and transfer size', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    const network = new NetworkManager(driver);
    await network.start();
    server.route('/route1', (_, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('A'.repeat(10));
    });
    await driver.page.goto(server.PREFIX + '/route1', {
      waitUntil: 'networkidle',
    });
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo[0].response.body?.bytes).toBe(10);
    expect(netinfo[0].transferSize).toBeGreaterThan(100);
  });

  it('timings for aborted requests', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    await driver.client.send('Network.setCacheDisabled', {
      cacheDisabled: true,
    });
    const network = new NetworkManager(driver);
    await network.start();

    const delayTime = 20;
    server.route('/abort', async (req, res) => {
      await delay(delayTime + 1);
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
      response: {
        mimeType: 'x-unknown',
        status: -1,
        redirectURL: '',
      },
      timings: expect.any(Object),
    });
    expect(netinfo[1].timings.total).toBeGreaterThan(delayTime);
  });

  it('timings for chunked response', async () => {
    const driver = await Gatherer.setupDriver({ wsEndpoint });
    await driver.client.send('Network.setCacheDisabled', {
      cacheDisabled: true,
    });
    const network = new NetworkManager(driver);
    await network.start();

    const delayTime = 100;
    server.route('/chunked', async (req, res) => {
      await delay(delayTime + 1);
      res.writeHead(200, {
        'content-type': 'application/javascript',
      });
      res.write('a');
      await delay(delayTime + 1);
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
      response: expect.any(Object),
      timings: expect.any(Object),
    });
    const timings = netinfo[1].timings;
    expect(timings.wait).toBeGreaterThanOrEqual(delayTime);
    expect(timings.receive).toBeGreaterThanOrEqual(delayTime);
    expect(timings.total).toBeGreaterThanOrEqual(
      timings.wait + timings.receive
    );
  });

  it('capture network data from popups', async () => {
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    const { page, context } = driver;
    const network = new NetworkManager(driver);
    await network.start();

    // Simulate user flow from test page -> popup page
    await page.goto(server.TEST_PAGE);
    await page.setContent(
      '<a target=_blank rel=noopener href="/popup.html">popup</a>'
    );
    const [page1] = await Promise.all([
      context.waitForEvent('page'),
      page.click('a'),
    ]);
    await page1.waitForLoadState('load');
    expect(await page1.textContent('body')).toEqual('Not found');

    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toBe(2);
    expect(netinfo).toMatchObject([
      {
        url: server.TEST_PAGE,
      },
      {
        url: `${server.PREFIX}/popup.html`,
      },
    ]);
  });

  it('cached resource timings', async () => {
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });

    const network = new NetworkManager(driver);
    await network.start();

    const delayTime = 5;
    server.route('/test.js', async (req, res) => {
      res.writeHead(200, {
        'content-type': 'application/javascript',
        'cache-control': 'public; max-age=600',
      });
      await delay(delayTime + 1);
      res.end('var a=10');
    });
    server.route('/index', async (_, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(`<script src=${server.PREFIX}/test.js />`);
    });

    await driver.page.goto(server.PREFIX + '/index', {
      waitUntil: 'networkidle',
    });
    await driver.page.reload({ waitUntil: 'networkidle' });
    await delay(delayTime + 1);
    const netinfo = await network.stop();
    await Gatherer.stop();
    const resources = netinfo.filter(req =>
      req.url.includes(`${server.PREFIX}/test.js`)
    );
    expect(resources.length).toBe(2);
    resources.forEach(res => {
      const timing = res.timings;
      expect(timing.wait).toBeGreaterThan(delayTime);
      expect(timing.total).toBeGreaterThan(timing.wait + timing.receive);
      // Check with absolute value to make sure we are not crossing absurd values
      expect(timing.total).toBeLessThan(50);
    });
  });

  it("doesn't capture network info from request context", async () => {
    const driver = await Gatherer.setupDriver({
      wsEndpoint,
    });
    const network = new NetworkManager(driver);
    await network.start();

    await driver.request.get(server.TEST_PAGE);
    const netinfo = await network.stop();
    await Gatherer.stop();
    expect(netinfo.length).toBe(0);
    await Gatherer.dispose(driver);
  });
});

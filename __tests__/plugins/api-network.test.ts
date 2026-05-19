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

import { request as apiRequest, APIRequestContext } from 'playwright-core';
import { APINetworkManager } from '../../src/plugins/api-network';
import { Server } from '../utils/server';

describe('APINetworkManager', () => {
  let server: Server;
  let request: APIRequestContext;
  let mgr: APINetworkManager;

  beforeAll(async () => {
    server = await Server.create();
    server.route('/hello', (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, ok: true }));
    });
    server.route('/notfound', (_, res) => {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('nope');
    });
  });
  afterAll(async () => await server.close());

  beforeEach(async () => {
    request = await apiRequest.newContext();
    mgr = new APINetworkManager({ request });
  });
  afterEach(async () => {
    await mgr.stop();
    await request.dispose();
  });

  it('captures a successful GET into NetworkInfo', async () => {
    await mgr.start();
    const url = `${server.PREFIX}/hello`;
    const res = await request.get(url);
    expect(res.status()).toBe(200);
    const results = await mgr.stop();
    expect(results).toHaveLength(1);
    const [entry] = results;
    expect(entry).toMatchObject({
      url,
      type: 'fetch',
      request: { url, method: 'GET' },
      response: { status: 200, mimeType: expect.stringMatching(/json/) },
    });
    expect(entry.requestSentTime).toBeGreaterThan(0);
    expect(entry.responseReceivedTime).toBeGreaterThanOrEqual(
      entry.requestSentTime
    );
    expect(entry.timings.total).toBeGreaterThanOrEqual(0);
    // Response body bytes derived either from Content-Length or from
    // the body buffer length.
    expect(entry.response.body?.bytes).toBeGreaterThan(0);
    expect(entry.transferSize).toBeGreaterThanOrEqual(
      entry.response.body?.bytes ?? 0
    );
    expect(entry.resourceSize).toBe(entry.response.body?.bytes);
  });

  it('records request body bytes for POST', async () => {
    await mgr.start();
    server.route('/post', (req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    await request.post(`${server.PREFIX}/post`, {
      data: { hello: 'world' },
    });
    const results = await mgr.stop();
    const expectedReqBody = Buffer.byteLength(
      JSON.stringify({ hello: 'world' })
    );
    expect(results[0].request.body?.bytes).toBe(expectedReqBody);
    expect(results[0].request.bytes).toBeGreaterThanOrEqual(expectedReqBody);
  });

  it('does not probe TLS for plain HTTP (no securityDetails)', async () => {
    await mgr.start();
    await request.get(`${server.PREFIX}/hello`);
    const results = await mgr.stop();
    expect(results[0].response.securityDetails).toBeUndefined();
    expect(results[0].response.remoteIPAddress).toBeUndefined();
  });

  it('captures HTTP methods passed via request.fetch options.method', async () => {
    await mgr.start();
    server.route('/echo', (req, res) => {
      res.writeHead(200);
      res.end(req.method);
    });
    const res = await request.fetch(`${server.PREFIX}/echo`, {
      method: 'PUT',
    });
    expect(res.status()).toBe(200);
    const results = await mgr.stop();
    expect(results[0].request.method).toBe('PUT');
  });

  it('records non-2xx responses with the correct status', async () => {
    await mgr.start();
    const res = await request.get(`${server.PREFIX}/notfound`);
    expect(res.status()).toBe(404);
    const results = await mgr.stop();
    expect(results[0].response.status).toBe(404);
  });

  it('keeps an entry and rethrows when the underlying request fails', async () => {
    await mgr.start();
    await expect(
      request.get('http://127.0.0.1:1/this-will-fail', { timeout: 1000 })
    ).rejects.toBeDefined();
    const results = await mgr.stop();
    expect(results).toHaveLength(1);
    // failure leaves the placeholder status
    expect(results[0].response.status).toBe(-1);
  });

  it('tags each entry with the active step', async () => {
    await mgr.start();
    mgr._currentStep = { name: 'first' } as any;
    await request.get(`${server.PREFIX}/hello`);
    mgr._currentStep = { name: 'second' } as any;
    await request.get(`${server.PREFIX}/hello`);
    const results = await mgr.stop();
    expect(results.map(r => r.step?.name)).toEqual(['first', 'second']);
  });

  it('restores the original fetch on stop', async () => {
    const originalFetch = request.fetch;
    await mgr.start();
    expect(request.fetch).not.toBe(originalFetch);
    await mgr.stop();
    expect(request.fetch).toBe(originalFetch);
    // convenience methods always route through the prototype's fetch, so a
    // call after stop must not record anything new.
    const len = mgr.results.length;
    await request.get(`${server.PREFIX}/hello`);
    expect(mgr.results.length).toBe(len);
  });

  it('is idempotent on repeated start / stop', async () => {
    await mgr.start();
    await mgr.start();
    await request.get(`${server.PREFIX}/hello`);
    const results = await mgr.stop();
    expect(results).toHaveLength(1);
    // second stop must be safe
    await expect(mgr.stop()).resolves.toBeDefined();
  });
});

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

import https from 'https';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AddressInfo } from 'net';
import {
  request,
  getGlobalDispatcher,
  setGlobalDispatcher,
  Dispatcher,
} from 'undici';
import { setGlobalProxy } from '../../src/helpers';

const CA_DIR = join(__dirname, '..', 'fixtures', 'ca');
const ca = readFileSync(join(CA_DIR, 'localhost-ca.crt'), 'utf-8');
const key = readFileSync(join(CA_DIR, 'localhost-ca.key'), 'utf-8');

describe('setGlobalProxy certificate authorities', () => {
  let server: https.Server;
  let url: string;
  let originalDispatcher: Dispatcher;

  beforeAll(async () => {
    originalDispatcher = getGlobalDispatcher();
    server = https.createServer({ cert: ca, key }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>(resolve => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    url = `https://localhost:${port}/`;
  });

  afterAll(async () => {
    setGlobalDispatcher(originalDispatcher);
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('rejects a server signed by an untrusted CA', async () => {
    setGlobalProxy({});
    await expect(request(url)).rejects.toThrow();
  });

  it('trusts a server when its CA is configured', async () => {
    setGlobalProxy({}, ca);
    const { statusCode, body } = await request(url);
    expect(statusCode).toBe(200);
    await expect(body.json()).resolves.toEqual({ ok: true });
  });
});

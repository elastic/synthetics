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

import { AddressInfo } from 'net';
import { probeTLS } from '../../src/plugins/api-tls';
import { Server } from '../utils/server';

describe('probeTLS', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = await Server.create({ tls: true });
    port = (server._server.address() as AddressInfo).port;
  });
  afterAll(async () => await server.close());

  it('returns a SecurityDetails object with cert fields for HTTPS', async () => {
    const result = await probeTLS('localhost', port);
    if (!result) throw new Error('expected non-null TLS probe result');
    expect(result.securityDetails).toMatchObject({
      protocol: expect.stringMatching(/^TLS /),
      validFrom: expect.any(Number),
      validTo: expect.any(Number),
    });
    const { validFrom, validTo } = result.securityDetails;
    expect(validTo).toBeGreaterThan(validFrom as number);
    expect(result.remotePort).toBe(port);
    expect(result.remoteAddress).toBeDefined();
  });

  it('measures dns, connect, and ssl timings', async () => {
    const result = await probeTLS('localhost', port);
    if (!result) throw new Error('expected non-null TLS probe result');
    expect(result.timings.dns).toBeGreaterThanOrEqual(0);
    expect(result.timings.connect).toBeGreaterThanOrEqual(0);
    expect(result.timings.ssl).toBeGreaterThanOrEqual(0);
  });

  /**
   * IP-literal hosts skip DNS, so the `lookup` event never fires. The
   * probe must still surface a meaningful `connect` timing instead of
   * cascading through the missing-DNS sentinel.
   */
  it('reports connect timing for IP-literal hosts (no DNS)', async () => {
    const result = await probeTLS('127.0.0.1', port);
    if (!result) throw new Error('expected non-null TLS probe result');
    expect(result.timings.dns).toBe(0);
    expect(result.timings.connect).toBeGreaterThanOrEqual(0);
    expect(result.timings.ssl).toBeGreaterThanOrEqual(0);
  });

  it('resolves null on connection refused', async () => {
    // Port 1 is reserved; nothing listens there.
    const result = await probeTLS('127.0.0.1', 1, 500);
    expect(result).toBeNull();
  });

  it('resolves null on connection timeout', async () => {
    // 10.255.255.1 is non-routable on most networks → triggers timeout.
    const result = await probeTLS('10.255.255.1', 443, 200);
    expect(result).toBeNull();
  });
});

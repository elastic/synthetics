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

import http from 'http';
import https from 'https';
import net, { AddressInfo } from 'net';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  request,
  getGlobalDispatcher,
  setGlobalDispatcher,
  Dispatcher,
} from 'undici';
import { setGlobalProxy } from '../../src/helpers';

const CA_DIR = join(__dirname, '..', 'fixtures', 'ca');
const kibanaCa = readFileSync(join(CA_DIR, 'localhost-ca.crt'), 'utf-8');
const kibanaKey = readFileSync(join(CA_DIR, 'localhost-ca.key'), 'utf-8');

function listen(
  server: http.Server | https.Server,
  host = '127.0.0.1'
): Promise<number> {
  return new Promise(resolve => {
    server.listen(0, host, () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function closeServer(server?: http.Server | https.Server) {
  return new Promise<void>(resolve => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function attachConnectTunnel(server: http.Server) {
  server.on('connect', (req, clientSocket, head) => {
    const [hostname, port] = req.url.split(':');
    const origin = net.connect(Number(port), hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) {
        origin.write(head);
      }
      origin.pipe(clientSocket);
      clientSocket.pipe(origin);
    });
    origin.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => origin.destroy());
  });
}

function createLocalhostTls() {
  const dir = mkdtempSync(join(tmpdir(), 'synthetics-proxy-ca-'));
  const cnf = join(dir, 'openssl.cnf');
  writeFileSync(
    cnf,
    `[req]
distinguished_name = dn
prompt = no
[dn]
CN = localhost
[v3]
subjectAltName = DNS:localhost,IP:127.0.0.1
`
  );
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-config',
      cnf,
      '-extensions',
      'v3',
    ],
    { stdio: 'pipe' }
  );
  return {
    dir,
    key: readFileSync(keyPath, 'utf-8'),
    cert: readFileSync(certPath, 'utf-8'),
  };
}

async function expectOk(url: string) {
  const { statusCode, body } = await request(url);
  expect(statusCode).toBe(200);
  await expect(body.json()).resolves.toEqual({ ok: true });
}

describe('setGlobalProxy certificate authorities', () => {
  let server: https.Server;
  let url: string;
  let originalDispatcher: Dispatcher;

  beforeAll(async () => {
    originalDispatcher = getGlobalDispatcher();
    server = https.createServer(
      { cert: kibanaCa, key: kibanaKey },
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    );
    const port = await listen(server);
    url = `https://localhost:${port}/`;
  });

  afterAll(async () => {
    setGlobalDispatcher(originalDispatcher);
    await closeServer(server);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  it('rejects a server signed by an untrusted CA', async () => {
    setGlobalProxy({});
    await expect(request(url)).rejects.toThrow();
  });

  it('trusts a server when its CA is configured', async () => {
    setGlobalProxy({}, kibanaCa);
    await expectOk(url);
  });

  describe('through an HTTP proxy', () => {
    let proxy: http.Server;
    let proxyUri: string;

    beforeAll(async () => {
      proxy = http.createServer();
      attachConnectTunnel(proxy);
      const port = await listen(proxy);
      proxyUri = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      await closeServer(proxy);
    });

    it('rejects Kibana TLS when only proxy.ca is set', async () => {
      // --proxy-ca is the proxy hop; it must not be treated as Kibana trust.
      setGlobalProxy({ uri: proxyUri, ca: kibanaCa });
      await expect(request(url)).rejects.toThrow();
    });

    it('trusts Kibana TLS when certificateAuthorities is set', async () => {
      setGlobalProxy({ uri: proxyUri }, kibanaCa);
      await expectOk(url);
    });
  });

  describe('through an HTTPS proxy', () => {
    let proxy: https.Server;
    let proxyUri: string;
    let proxyTls: ReturnType<typeof createLocalhostTls>;

    beforeAll(async () => {
      proxyTls = createLocalhostTls();
      proxy = https.createServer({ cert: proxyTls.cert, key: proxyTls.key });
      attachConnectTunnel(proxy);
      const port = await listen(proxy);
      proxyUri = `https://localhost:${port}`;
    });

    afterAll(async () => {
      await closeServer(proxy);
      rmSync(proxyTls.dir, { recursive: true, force: true });
    });

    it('rejects when only proxy.ca is configured', async () => {
      setGlobalProxy({ uri: proxyUri, ca: proxyTls.cert });
      await expect(request(url)).rejects.toThrow();
    });

    it('rejects when only certificateAuthorities is configured', async () => {
      setGlobalProxy({ uri: proxyUri }, kibanaCa);
      await expect(request(url)).rejects.toThrow();
    });

    it('succeeds when proxy.ca and certificateAuthorities cover both hops', async () => {
      setGlobalProxy({ uri: proxyUri, ca: proxyTls.cert }, kibanaCa);
      await expectOk(url);
    });
  });
});

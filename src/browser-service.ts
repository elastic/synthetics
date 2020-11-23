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

/* eslint-disable @typescript-eslint/no-var-requires */

const httpProxy = require('http-proxy');
const http = require('http');
const { chromium } = require('playwright-chromium');

const proxy = httpProxy.createProxyServer();
const proxyServer = http.createServer();

proxyServer.on('upgrade', async function (req, socket, head) {
  const browserServer = await chromium.launchServer({ headless: true });
  const wsEndpoint = browserServer.wsEndpoint();
  const parts = wsEndpoint.split('/');
  const guid = parts.pop();
  req.url = `/${guid}`;
  const target = parts.join('/');
  console.log(`New browser: ${wsEndpoint}`);
  proxy.ws(req, socket, head, { target });
  socket.on('close', async () => {
    await browserServer.close();
    console.log(`Socket closed: ${wsEndpoint}`);
  });
});

const port = 9322;
proxyServer.listen(port, () => {
  console.log(`Listening on port: ${port}`);
});

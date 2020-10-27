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

import http, { RequestListener, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { createReadStream } from 'fs';
import { join } from 'path';
import { AddressInfo } from 'net';

export class Server {
  TEST_PAGE: string;
  _server: http.Server;
  _routes = new Map<string, RequestListener>();
  static directory = join(__dirname, 'pages');

  static async create() {
    const instance = new Server();
    await new Promise(resolve => instance._server.once('listening', resolve));
    return instance;
  }

  constructor() {
    this._server = http.createServer(this._onRequest.bind(this));
    this._server.listen(0);
    const { port } = this._server.address() as AddressInfo;
    this.TEST_PAGE = `http://localhost:${port}/index.html`;
  }

  route(path, handler: RequestListener) {
    this._routes.set(path, handler);
  }

  _onRequest(request: IncomingMessage, response: ServerResponse) {
    const path = parse(request.url).path;
    const handler = this._routes.get(path);
    if (handler) {
      handler.call(null, request, response);
    } else {
      this.serve(path, response);
    }
  }

  serve(path: string, response: ServerResponse) {
    return createReadStream(join(Server.directory, path))
      .on('error', () => {
        response.statusCode = 404;
        return response.end('Not found');
      })
      .pipe(response);
  }

  async close() {
    this._routes.clear();
    await new Promise(resolve => this._server.close(resolve));
  }
}

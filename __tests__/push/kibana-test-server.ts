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
import { Server } from '../utils/server';
import { APISchema } from '../../src/push/monitor';

export const createKibanaTestServer = async () => {
  const server = await Server.create({ port: 54455 });
  const apiRes = { failedMonitors: [], failedStaleMonitors: [] };
  const apiBasePath = '/s/dummy/api/synthetics/project/dummy/monitors';
  server.route(apiBasePath, (req, res) => {
    res.end(JSON.stringify({ monitors: [] }));
  });
  server.route(apiBasePath + '/_bulk_update', async (req, res) => {
    await new Promise(r => setTimeout(r, 20));
    req.on('data', chunks => {
      const schema = JSON.parse(chunks.toString()) as APISchema;
      res.write(JSON.stringify(schema.monitors[0].name) + '\n');
    });
    req.on('end', () => {
      res.end(JSON.stringify(apiRes));
    });
  });
  server.route(apiBasePath + '/_bulk_delete', async (req, res) => {
    let schema;
    req.on('data', chunks => {
      schema = JSON.parse(chunks.toString()) as APISchema;
    });
    req.on('end', () => {
      res.end(JSON.stringify({ monitors: schema.monitors }));
    });
  });
  return server;
};

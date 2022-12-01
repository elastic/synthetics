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
import { Server } from './server';
import {
  GetResponse,
  LegacyAPISchema,
  PutResponse,
} from '../../src/push/kibana_api';

export const createKibanaTestServer = async (kibanaVersion: string) => {
  const server = await Server.create({ port: 54455 });
  server.route('/s/dummy/api/status', (req, res) =>
    res.end(JSON.stringify({ version: { number: kibanaVersion } }))
  );
  // Legacy
  server.route(
    '/s/dummy/api/synthetics/service/project/monitors',
    async (req, res) => {
      await new Promise(r => setTimeout(r, 20));
      req.on('data', chunks => {
        const schema = JSON.parse(chunks.toString()) as LegacyAPISchema;
        res.write(
          JSON.stringify(
            schema.monitors.length + ' monitors created successfully'
          ) + '\n'
        );
        if (!schema.keep_stale) {
          // write more than the stream buffer to check the broken NDJSON data
          res.write(
            JSON.stringify(Buffer.from('a'.repeat(70000)).toString()) + '\n'
          );
        }
      });
      req.on('end', () => {
        const apiRes = { failedMonitors: [], failedStaleMonitors: [] };
        res.end(JSON.stringify(apiRes));
      });
    }
  );

  // Post 8.6
  const basePath = '/s/dummy/api/synthetics/project/test-project/monitors';
  server.route(basePath, (req, res) => {
    const getResp = {
      total: 2,
      monitors: [
        { journey_id: 'j3', hash: 'hash1' },
        { journey_id: 'j4', hash: 'hash2' },
      ],
    } as GetResponse;
    res.end(JSON.stringify(getResp));
  });
  server.route(basePath + '/_bulk_update', (req, res) => {
    const updateResponse = {
      createdMonitors: ['j1', 'j2'],
      updatedMonitors: [],
      failedMonitors: [],
    } as PutResponse;
    res.end(JSON.stringify(updateResponse));
  });
  server.route(basePath + '/_bulk_delete', (req, res) => {
    res.end(JSON.stringify({ deleted_monitors: ['j3', 'j4'] }));
  });
  return server;
};

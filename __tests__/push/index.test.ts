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

import { join } from 'path';
import { Monitor } from '../../src/dsl/monitor';
import { buildMonitorSchema } from '../../src/push/monitor';
import { createMonitors } from '../../src/push/request';
import { Server } from '../utils/server';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

function createTestMonitor(filename: string) {
  const monitor = new Monitor({
    id: 'test-monitor',
    name: 'test',
    schedule: 10,
    locations: ['EU West'],
  });
  monitor.setSource({
    file: join(FIXTURES_DIR, filename),
    line: 0,
    column: 0,
  });
  return monitor;
}

describe('Push', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
  });

  it('creates monitor', async () => {
    server.route(
      '/s/default/api/synthetics/service/push/monitors',
      (req, res) => {
        let data = '';
        req.on('data', chunks => {
          data += chunks;
        });
        req.on('end', () => {
          // Write the post data back
          res.end(data.toString());
        });
      }
    );

    const monitor = createTestMonitor('example.journey.ts');
    const schema = await buildMonitorSchema([monitor]);
    expect(schema[0]).toMatchObject({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      locations: ['europe-west2-a'],
      content: expect.any(String),
    });
    const { statusCode, body } = await createMonitors(schema, {
      url: `${server.PREFIX}`,
      auth: 'foo:bar',
      project: 'blah',
      space: 'default',
      delete: false,
    });

    expect(statusCode).toBe(200);
    let data = '';
    for await (const chunk of body) {
      data += chunk;
    }
    expect(JSON.parse(data)).toEqual({
      project: 'blah',
      keep_stale: true,
      monitors: schema,
    });
  });
});

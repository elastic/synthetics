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

import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { generateTempPath } from '../../src/helpers';
import {
  buildMonitorSchema,
  createMonitors,
  createLightweightMonitors,
  parseSchedule,
} from '../../src/push/monitor';
import { Server } from '../utils/server';
import { createTestMonitor } from '../utils/test-config';

describe('Monitors', () => {
  const monitor = createTestMonitor('example.journey.ts');
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
    process.env.NO_COLOR = '';
  });

  it('build lightweight monitor schema', async () => {
    const schema = await buildMonitorSchema([
      createTestMonitor('heartbeat.yml', 'http'),
    ]);
    expect(schema[0]).toEqual({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      type: 'http',
      enabled: true,
      locations: ['europe-west2-a', 'australia-southeast1-a'],
      privateLocations: ['germany'],
    });
  });

  it('build browser monitor schema', async () => {
    const schema = await buildMonitorSchema([monitor]);
    expect(schema[0]).toEqual({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      type: 'browser',
      enabled: true,
      locations: ['europe-west2-a', 'australia-southeast1-a'],
      privateLocations: ['germany'],
      content: expect.any(String),
      filter: {
        match: 'test',
      },
    });
  });

  it('parse @every schedule format', async () => {
    expect(() => parseSchedule('* * * *')).toThrowError(
      `Monitor schedule format(* * * *) not supported: use '@every' syntax instead`
    );
    expect(parseSchedule('@every 4s')).toBe(1);
    expect(parseSchedule('@every 60s')).toBe(1);
    expect(parseSchedule('@every 1m')).toBe(1);
    expect(parseSchedule('@every 1m10s')).toBe(2);
    expect(parseSchedule('@every 2m')).toBe(2);
    expect(parseSchedule('@every 1h2m')).toBe(62);
    expect(parseSchedule('@every 1h2m10s')).toBe(63);
  });

  it('api schema', async () => {
    server.route(
      '/s/dummy/api/synthetics/service/project/monitors',
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
    const schema = await buildMonitorSchema([monitor]);
    const { statusCode, body } = await createMonitors(
      schema,
      {
        url: `${server.PREFIX}`,
        auth: 'apiKey',
        id: 'blah',
        space: 'dummy',
      },
      false
    );

    expect(statusCode).toBe(200);
    expect(await body.json()).toEqual({
      project: 'blah',
      keep_stale: false,
      monitors: schema,
    });
  });

  describe('Lightweight monitors', () => {
    const PROJECT_DIR = generateTempPath();
    const HB_SOURCE = join(PROJECT_DIR, 'heartbeat.yml');
    const opts = { auth: 'foo' };
    beforeEach(async () => {
      await mkdir(PROJECT_DIR, { recursive: true });
    });
    afterEach(async () => {
      await rm(PROJECT_DIR, { recursive: true });
    });

    const writeHBFile = async data => {
      await writeFile(HB_SOURCE, data, 'utf-8');
    };

    it('when no yml files are present', async () => {
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(0);
    });

    it('when no monitors are present', async () => {
      await writeHBFile(`
heartbeat.monitors:

heartbeat.run_once: true
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(0);
    });

    it('abort on schedule format error', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  schedule: "* * * *"
  id: "foo"
  name: "foo"
      `);
      expect(createLightweightMonitors(PROJECT_DIR, opts)).rejects.toContain(
        `Aborted: Monitor schedule format(* * * *) not supported: use '@every' syntax instead`
      );
    });

    it('validate id check', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  name: "foo"
      `);
      expect(createLightweightMonitors(PROJECT_DIR, opts)).rejects.toContain(
        `Aborted: Monitor id is required`
      );
    });

    it('validate name check', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  id: "foo"
      `);
      expect(createLightweightMonitors(PROJECT_DIR, opts)).rejects.toContain(
        `Aborted: Monitor name is required`
      );
    });

    it('skip browser monitors', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: browser
  schedule: "@every 1m"
  id: "browser-mon"
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(0);
    });

    it('skip disabled monitors', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  schedule: "@every 1m"
  id: "http"
  enabled: false
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(0);
    });

    it('parses monitor config correctly', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  schedule: @every 5m
  id: "foo"
  name: "with-loc"
  private_locations:
    - baz
      `);
      const [monitor] = await createLightweightMonitors(PROJECT_DIR, {
        locations: ['australia_east'],
      } as any);
      expect(monitor.config).toEqual({
        id: 'foo',
        name: 'with-loc',
        type: 'icmp',
        locations: ['australia_east'],
        privateLocations: ['baz'],
        schedule: 5,
      });
      expect(monitor.source).toEqual({
        file: HB_SOURCE,
        column: 3,
        line: 3,
      });
    });

    it('pass all monitor config as it is', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  schedule: @every 5m
  id: "foo"
  name: "with-fields"
  ssl:
    certificate_authorities: ['/etc/ca.crt']
  check.response:
    status: [200]
    body:
      - Saved
      - saved
  check.request:
    method: POST
    headers:
      'Content-Type': 'application/x-www-form-urlencoded'
      `);

      const [monitor] = await createLightweightMonitors(PROJECT_DIR, {
        locations: ['australia_east'],
      } as any);
      expect(monitor.config).toEqual({
        id: 'foo',
        name: 'with-fields',
        type: 'http',
        locations: ['australia_east'],
        privateLocations: undefined,
        schedule: 5,
        'check.request': {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
        },
        'check.response': {
          body: ['Saved', 'saved'],
          status: [200],
        },
        ssl: {
          certificate_authorities: ['/etc/ca.crt'],
        },
      });
    });
  });
});

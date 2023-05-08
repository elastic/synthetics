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
  createLightweightMonitors,
  diffMonitors,
  parseAlertConfig,
  parseSchedule,
} from '../../src/push/monitor';
import { Server } from '../utils/server';
import { createTestMonitor } from '../utils/test-config';
import { PushOptions } from '../../src/common_types';

describe('Monitors', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
    jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
  });
  afterAll(async () => {
    await server.close();
    jest.resetAllMocks();
    process.env.NO_COLOR = '';
  });

  it('diff monitors', () => {
    const local = [
      { journey_id: 'j1', hash: 'hash1' },
      { journey_id: 'j2', hash: 'hash2' },
      { journey_id: 'j3', hash: 'hash3' },
      { journey_id: 'j4', hash: 'hash4' },
    ];
    const remote = [
      { journey_id: 'j1', hash: 'hash1' },
      { journey_id: 'j2', hash: 'hash2-changed' },
      { journey_id: 'j4', hash: '' }, // Hash reset in UI
      { journey_id: 'j5', hash: 'hash5' },
    ];
    const result = diffMonitors(local, remote);
    expect(Array.from(result.newIDs)).toEqual(['j3']);
    expect(Array.from(result.changedIDs)).toEqual(['j2', 'j4']);
    expect(Array.from(result.removedIDs)).toEqual(['j5']);
    expect(Array.from(result.unchangedIDs)).toEqual(['j1']);
  });

  it('build lightweight monitor schema', async () => {
    const schema = await buildMonitorSchema(
      [createTestMonitor('heartbeat.yml', 'http')],
      true
    );
    expect(schema[0]).toEqual({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      type: 'http',
      enabled: true,
      hash: expect.any(String),
      locations: ['europe-west2-a', 'australia-southeast1-a'],
      privateLocations: ['germany'],
    });
  });

  it('build browser monitor schema', async () => {
    const monitor = createTestMonitor('example.journey.ts');
    const schema = await buildMonitorSchema([monitor], true);
    expect(schema[0]).toEqual({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      type: 'browser',
      enabled: true,
      hash: expect.any(String), // hash is dynamic based on the file path
      locations: ['europe-west2-a', 'australia-southeast1-a'],
      privateLocations: ['germany'],
      content: expect.any(String),
      filter: {
        match: 'test',
      },
    });
    monitor.setContent('foo');
    const schema1 = await buildMonitorSchema([monitor], true);
    expect(schema1[0].hash).not.toEqual(schema[0].hash);
  });

  it('parse @every schedule format', async () => {
    expect(() => parseSchedule('* * * *')).toThrowError(
      `Monitor schedule format(* * * *) not supported: use '@every' syntax instead`
    );
    expect(parseSchedule('@every 4s')).toBe(1);
    expect(parseSchedule('@every 70s')).toBe(1);
    expect(parseSchedule('@every 121s')).toBe(3);
    expect(parseSchedule('@every 1m')).toBe(1);
    expect(parseSchedule('@every 2m30s')).toBe(3);
    expect(parseSchedule('@every 181s')).toBe(3);
    expect(parseSchedule('@every 2m10s')).toBe(3);
    expect(parseSchedule('@every 4m25s')).toBe(5);
    expect(parseSchedule('@every 16m')).toBe(15);
    expect(parseSchedule('@every 24m')).toBe(20);
    expect(parseSchedule('@every 30m')).toBe(30);
    expect(parseSchedule('@every 45m')).toBe(60);
    expect(parseSchedule('@every 1h2m')).toBe(60);
    expect(parseSchedule('@every 110m')).toBe(120);
    expect(parseSchedule('@every 2h20m')).toBe(120);
    expect(parseSchedule('@every 3h50m')).toBe(240);
    expect(parseSchedule('@every 10h2m10s')).toBe(240);
    expect(parseSchedule('@every 1d')).toBe(240);
  });

  it('parse alert config option', async () => {
    expect(parseAlertConfig({})).toBe(undefined);
    expect(parseAlertConfig({ 'alert.status.enabled': true } as any)).toEqual({
      status: { enabled: true },
    });
    expect(parseAlertConfig({ alert: { status: { enabled: true } } })).toEqual({
      status: { enabled: true },
    });
  });

  describe('Lightweight monitors', () => {
    const PROJECT_DIR = generateTempPath();
    const HB_SOURCE = join(PROJECT_DIR, 'heartbeat.yml');
    const opts: PushOptions = { auth: 'foo' };
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

    it('match file pattern', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  schedule: "@every 1m"
  id: "foo"
  name: "foo"
      `);
      opts.pattern = '.yaml$';
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(0);
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

    it('use schedule from config', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  id: foo
  name: without schedule
      `);
      const [monitor] = await createLightweightMonitors(PROJECT_DIR, {
        schedule: 10,
      } as any);
      expect(monitor.config).toMatchObject({
        id: 'foo',
        name: 'without schedule',
        type: 'icmp',
        schedule: 10,
      });
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

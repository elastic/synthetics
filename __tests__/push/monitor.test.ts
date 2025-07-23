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
  parseFields,
  parseSchedule,
  parseSpaces,
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
    const { schemas } = await buildMonitorSchema(
      [createTestMonitor('heartbeat.yml', 'http')],
      true
    );
    expect(schemas[0]).toEqual({
      id: 'test-monitor',
      name: 'test',
      schedule: 10,
      type: 'http',
      enabled: true,
      hash: expect.any(String),
      locations: ['europe-west2-a', 'australia-southeast1-a'],
      privateLocations: ['germany'],
      fields: { area: 'website' },
      spaces: ['test'],
    });
  });

  it('build browser monitor schema', async () => {
    const monitor = createTestMonitor('example.journey.ts');
    const { schemas } = await buildMonitorSchema([monitor], true);
    expect(schemas[0]).toEqual({
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
      fields: { area: 'website' },
      spaces: ['test'],
    });
    monitor.update({
      locations: ['brazil'],
      fields: { env: 'dev' },
    });
    const { schemas: schemas1 } = await buildMonitorSchema([monitor], true);
    expect(schemas1[0].hash).not.toEqual(schemas[0].hash);
    expect(schemas1[0].fields).toEqual({
      area: 'website',
      env: 'dev',
    });
  });

  it('parse @every schedule format', async () => {
    expect(() => parseSchedule('* * * *')).toThrowError(
      `Monitor schedule format(* * * *) not supported: use '@every' syntax instead`
    );
    expect(parseSchedule('@every 4s')).toBe('10s');
    expect(parseSchedule('@every 40s')).toBe('30s');
    expect(parseSchedule('@every 70s')).toBe(1);
    expect(parseSchedule('@every 121s')).toBe(2);
    expect(parseSchedule('@every 1m')).toBe(1);
    expect(parseSchedule('@every 2m30s')).toBe(2);
    expect(parseSchedule('@every 181s')).toBe(3);
    expect(parseSchedule('@every 2m10s')).toBe(2);
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

    it('prefer user provider pattern option', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  schedule: "@every 1m"
  id: "foo"
  name: "foo"
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, {
        ...opts,
        grepOpts: { pattern: '.yaml$' },
      });
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

    it('push disabled monitors', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  name: "disabled"
  schedule: "@every 1m"
  id: "disabled"
  enabled: false
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, opts);
      expect(monitors.length).toBe(1);
    });

    it('push - match filter', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  name: "m1"
  id: "mon1"
  tags: "tag1"
- type: http
  name: "m2"
  id: "mon2"
  tags: "tag2"
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, {
        ...opts,
        grepOpts: { match: 'm1' },
      });
      expect(monitors.length).toBe(1);
      expect(monitors[0].config.name).toEqual('m1');
    });

    it('push - tags filter', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  name: "m1"
  id: "mon1"
  tags: ["foo", "bar"]
- type: http
  name: "m2"
  id: "mon2"
  tags: ["bar", "baz"]
- type: http
  name: "m3"
  id: "mon3"
  tags: ["baz", "boom"]
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, {
        ...opts,
        grepOpts: { tags: ['bar'] },
      });
      expect(monitors.length).toBe(2);
      expect(monitors.map(m => m.config.name)).toEqual(['m1', 'm2']);
    });

    it('push - apply tags config and also filter', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: http
  name: "m1"
  id: "mon1"
  tags: ["foo"]
- type: http
  name: "m2"
  id: "mon2"
- type: http
  name: "m3"
  id: "mon3"
      `);
      const monitors = await createLightweightMonitors(PROJECT_DIR, {
        ...opts,
        tags: ['ltag'],
        grepOpts: { tags: ['ltag'] },
      });
      expect(monitors.length).toBe(2);
      expect(monitors.map(m => m.config.name)).toEqual(['m2', 'm3']);
    });

    it('prefer local monitor config', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  schedule: @every 5m
  id: "test-icmp"
  name: "test-icmp"
  privateLocations:
    - baz
  tags:
    - ltag1
    - ltag2
  retest_on_failure: true
      `);

      const [mon] = await createLightweightMonitors(PROJECT_DIR, {
        auth: 'foo',
        params: { foo: 'bar' },
        kibanaVersion: '8.8.0',
        locations: ['australia_east'],
        tags: ['gtag1', 'gtag2'],
        privateLocations: ['gbaz'],
        schedule: 10,
        retestOnFailure: false,
      });

      expect(mon.config).toEqual({
        id: 'test-icmp',
        name: 'test-icmp',
        locations: ['australia_east'],
        privateLocations: ['baz'],
        type: 'icmp',
        params: { foo: 'bar' },
        schedule: 5,
        tags: ['ltag1', 'ltag2'],
        retestOnFailure: true,
      });
    });

    it('fallback to global monitor config', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  id: "test-icmp"
  name: "test-icmp"
      `);

      const [mon] = await createLightweightMonitors(PROJECT_DIR, {
        auth: 'foo',
        tags: ['gtag1', 'gtag2'],
        privateLocations: ['gbaz'],
        schedule: 10,
        retestOnFailure: false,
      });

      expect(mon.config).toEqual({
        id: 'test-icmp',
        name: 'test-icmp',
        privateLocations: ['gbaz'],
        type: 'icmp',
        schedule: 10,
        tags: ['gtag1', 'gtag2'],
        retestOnFailure: false,
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

    it('support anchors', async () => {
      await writeHBFile(`
http-type: &http-type
  type: http
schedule5: &schedule-5
  schedule: '@every 5m'
team-tag: &team-tag
  tags:
    - team1
    - team2

heartbeat.monitors:
- id: http1
  name: "http1"
  schedule: '@every 1m'
  <<: *http-type
  <<: *team-tag
  urls: "https://blog.elastic.co"
- id: http2
  name: "http2"
  <<: *http-type
  <<: *schedule-5
  urls: "https://elastic.co"
- id: tcp1
  name: "tcp1"
  type: tcp
  <<: *schedule-5
  hosts: ["elastic.co:443"]
      `);
      const [mon1, mon2, mon3] = await createLightweightMonitors(
        PROJECT_DIR,
        opts
      );
      expect(mon1.config).toMatchObject({
        id: 'http1',
        name: 'http1',
        schedule: 1,
        type: 'http',
        tags: ['team1', 'team2'],
        urls: 'https://blog.elastic.co',
      });
      expect(mon2.config).toMatchObject({
        id: 'http2',
        name: 'http2',
        schedule: 5,
        type: 'http',
        urls: 'https://elastic.co',
      });
      expect(mon3.config).toMatchObject({
        id: 'tcp1',
        name: 'tcp1',
        schedule: 5,
        type: 'tcp',
        hosts: ['elastic.co:443'],
      });
    });

    it('supports fields in config', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  schedule: @every 5m
  id: "test-icmp"
  name: "test-icmp"
  privateLocations:
    - baz
  tags:
    - ltag1
    - ltag2
  fields.foo: bar
  fields.baz: qux
      `);

      const [mon] = await createLightweightMonitors(PROJECT_DIR, {
        space: 'default',
        auth: 'foo',
        params: { foo: 'bar' },
        kibanaVersion: '8.8.0',
        locations: ['australia_east'],
        tags: ['gtag1', 'gtag2'],
        privateLocations: ['gbaz'],
        schedule: 10,
        retestOnFailure: false,
        spaces: ['default'],
      });

      expect(mon.config).toEqual({
        id: 'test-icmp',
        name: 'test-icmp',
        locations: ['australia_east'],
        privateLocations: ['baz'],
        type: 'icmp',
        params: { foo: 'bar' },
        schedule: 5,
        tags: ['ltag1', 'ltag2'],
        retestOnFailure: false,
        fields: {
          baz: 'qux',
          foo: 'bar',
        },
        spaces: ['default'],
      });
    });

    it('supports spaces in config', async () => {
      await writeHBFile(`
heartbeat.monitors:
- type: icmp
  schedule: @every 5m
  id: "test-icmp"
  name: "test-icmp"
  privateLocations:
    - baz
  tags:
    - ltag1
    - ltag2
  fields.foo: bar
  fields.baz: qux
  spaces:
    - space1
    - space2
      `);

      const [mon] = await createLightweightMonitors(PROJECT_DIR, {
        space: 'default',
        auth: 'foo',
        params: { foo: 'bar' },
        kibanaVersion: '8.8.0',
        locations: ['australia_east'],
        tags: ['gtag1', 'gtag2'],
        privateLocations: ['gbaz'],
        schedule: 10,
        retestOnFailure: false,
      });

      expect(mon.config).toEqual({
        id: 'test-icmp',
        name: 'test-icmp',
        locations: ['australia_east'],
        privateLocations: ['baz'],
        type: 'icmp',
        params: { foo: 'bar' },
        schedule: 5,
        tags: ['ltag1', 'ltag2'],
        retestOnFailure: false,
        fields: {
          baz: 'qux',
          foo: 'bar',
        },
        spaces: ['default', 'space1', 'space2'],
      });
    });
  });

  describe('parseAlertConfig', () => {
    it('parse alert config option', async () => {
      expect(parseAlertConfig({})).toBe(undefined);
      expect(parseAlertConfig({ 'alert.status.enabled': true } as any)).toEqual(
        {
          status: { enabled: true },
        }
      );
      expect(
        parseAlertConfig({ alert: { status: { enabled: true } } })
      ).toEqual({
        status: { enabled: true },
      });
    });

    it('parse alert config option when global config is also provided', async () => {
      expect(
        parseAlertConfig(
          { alert: { 'status.enabled': false, 'tls.enabled': true } } as any,
          {
            status: { enabled: false },
            tls: { enabled: false },
          }
        )
      ).toEqual({
        status: { enabled: false },
        tls: {
          enabled: true,
        },
      });
      expect(
        parseAlertConfig(
          { alert: { status: { enabled: true } } },
          {
            status: { enabled: false },
            tls: { enabled: true },
          }
        )
      ).toEqual({
        status: { enabled: true },
        tls: {
          enabled: true,
        },
      });
    });

    it('parse tls alert config option', async () => {
      expect(parseAlertConfig({})).toBe(undefined);
      expect(
        parseAlertConfig({
          'alert.status.enabled': true,
          'alert.tls.enabled': true,
        } as any)
      ).toEqual({
        status: { enabled: true },
        tls: { enabled: true },
      });
      expect(parseAlertConfig({ 'alert.tls.enabled': true } as any)).toEqual({
        tls: { enabled: true },
      });
      expect(
        parseAlertConfig(
          { alert: { tls: { enabled: true } } },
          {
            status: { enabled: false },
          }
        )
      ).toEqual({
        tls: { enabled: true },
        status: { enabled: false },
      });
    });

    it('deletes parsed keys from config', async () => {
      let config: any = {
        'alert.status.enabled': true,
        'alert.tls.enabled': true,
      };
      expect(parseAlertConfig(config)).toEqual({
        status: { enabled: true },
        tls: { enabled: true },
      });
      expect(config).toEqual({});

      config = {
        alert: {
          'status.enabled': true,
          'tls.enabled': true,
        },
      };
      expect(parseAlertConfig(config)).toEqual({
        status: { enabled: true },
        tls: { enabled: true },
      });
      expect(config).toEqual({});
    });
  });

  describe('parseFields', () => {
    it('extracts fields from config and removes them', () => {
      const config = {
        'fields.label1': 'value1',
        'fields.label2': 'value2',
        otherKey: 'otherValue',
      };

      const result = parseFields(config as any);

      expect(result).toEqual({ label1: 'value1', label2: 'value2' });
      expect(config).toEqual({ otherKey: 'otherValue' }); // Ensure fields were deleted
    });

    it('merges global fields into parsed fields', () => {
      const config = {
        'fields.label1': 'value1',
      };
      const gFields = {
        label2: 'globalValue',
        label3: 'anotherGlobalValue',
      };

      const result = parseFields(config as any, gFields);

      expect(result).toEqual({
        label1: 'value1',
        label2: 'globalValue',
        label3: 'anotherGlobalValue',
      });
    });

    it('returns only global fields if no config fields exist', () => {
      const config = {
        otherKey: 'otherValue',
      };
      const gFields = {
        label1: 'globalValue',
      };

      const result = parseFields(config as any, gFields);

      expect(result).toEqual({ label1: 'globalValue' });
    });

    it('returns undefined if no fields exist', () => {
      const config = {
        otherKey: 'otherValue',
      };
      const result = parseFields(config as any);

      expect(result).toBeUndefined();
    });
  });

  describe('parseSpaces', () => {
    it('returns empty object if no spaces are defined', () => {
      expect(parseSpaces({}, {} as any)).toEqual({});
      expect(parseSpaces({ spaces: undefined }, {} as any)).toEqual({});
      expect(parseSpaces({}, { spaces: undefined } as any)).toEqual({});
    });

    it('merges config and options spaces, including global space', () => {
      const config = { spaces: ['space1'] };
      const options = { spaces: ['space2'], space: 'global' };
      expect(parseSpaces(config, options as any)).toEqual({
        spaces: ['global', 'space1', 'space2'],
      });
    });

    it('handles only config spaces', () => {
      expect(parseSpaces({ spaces: ['foo'] }, {} as any)).toEqual({
        spaces: ['foo'],
      });
    });

    it('handles only options spaces', () => {
      expect(parseSpaces({}, { spaces: ['bar'] } as any)).toEqual({
        spaces: ['bar'],
      });
    });

    it('handles global space only', () => {
      expect(parseSpaces({}, { space: 'default' } as any)).toEqual({});
    });

    it('deduplicates spaces', () => {
      const config = { spaces: ['space1', 'space2'] };
      const options = { spaces: ['space2', 'space3'], space: 'space1' };
      expect(parseSpaces(config, options as any)).toEqual({
        spaces: ['space1', 'space2', 'space3'],
      });
    });

    it('returns wildcard if present', () => {
      expect(
        parseSpaces({ spaces: ['*'] }, {
          space: 'default',
          spaces: ['foo'],
        } as any)
      ).toEqual({
        spaces: ['*'],
      });
      expect(parseSpaces({}, { spaces: ['*'] } as any)).toEqual({
        spaces: ['*'],
      });
    });
  });
});

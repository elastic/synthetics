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
process.env.NO_COLOR = '1';

import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { Monitor } from '../../src/dsl/monitor';
import { formatDuplicateError } from '../../src/push';
import { createKibanaTestServer } from '../utils/kibana-test-server';
import { Server } from '../utils/server';
import { CLIMock } from '../utils/test-config';
import { THROTTLING_WARNING_MSG } from '../../src/helpers';
import Straightforward from 'straightforward';
import { AddressInfo } from 'net';

describe('Push', () => {
  let server: Server;
  const PROJECT_DIR = join(__dirname, 'new-project');
  const DEFAULT_ARGS = ['--auth', 'foo'];

  async function runPush(args = DEFAULT_ARGS, env?) {
    const cli = new CLIMock()
      .args(['push', ...args])
      .run({ cwd: PROJECT_DIR, env: { ...process.env, ...env } });
    await cli.exitCode;
    return cli.stderr();
  }

  async function fakeProjectSetup(
    settings,
    monitor,
    filename = 'synthetics.config.ts'
  ) {
    await writeFile(
      join(PROJECT_DIR, filename),
      `export default ${JSON.stringify({ ...settings, monitor })}`
    );
  }

  beforeAll(async () => {
    server = await createKibanaTestServer('8.6.0');
    await mkdir(PROJECT_DIR, { recursive: true });
  });
  afterAll(async () => {
    process.env.NO_COLOR = '';
    await server.close();
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  it('error when project is not setup', async () => {
    const output = await runPush();
    expect(output).toContain(
      'Aborted (missing synthetics config file), Project not set up correctly.'
    );
  });

  it('error when auth is ignored', async () => {
    await fakeProjectSetup({}, {});
    const output = await runPush([]);
    expect(output).toContain(`required option '--auth <auth>' not specified`);
  });

  it('error on empty project id', async () => {
    await fakeProjectSetup({}, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid location', async () => {
    await fakeProjectSetup({ project: { id: 'test-project' } }, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error when schedule is not present', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project' } },
      { locations: ['test-loc'] }
    );
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid schedule', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project' } },
      { locations: ['test-loc'], schedule: 12 }
    );
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('abort on push with different project id', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project' } },
      { locations: ['test-loc'], schedule: 3 }
    );
    const output = await runPush(
      [...DEFAULT_ARGS, '-y', '--id', 'new-project'],
      {
        TEST_OVERRIDE: false,
      }
    );
    expect(output).toContain('Push command Aborted');
  });

  it('error on invalid schedule in monitor DSL', async () => {
    await fakeProjectSetup(
      {
        project: {
          id: 'test-project',
          space: 'dummy',
          url: 'http://localhost:8080',
        },
      },
      { locations: ['test-loc'], schedule: 3 }
    );
    const testJourney = join(PROJECT_DIR, 'test.journey.ts');
    await writeFile(
      testJourney,
      `import {journey, monitor} from '../../../';
journey('journey 1', () => monitor.use({ id: 'j1', schedule: 8 }));`
    );
    const output = await runPush();
    expect(output).toContain('Invalid schedule: 8, allowed values are');
    await rm(testJourney, { force: true });
  });

  it('errors on duplicate browser monitors', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
      { locations: ['test-loc'], schedule: 3 }
    );

    const dupJourney = join(PROJECT_DIR, 'duplicate.journey.ts');
    await writeFile(
      dupJourney,
      `import {journey, monitor} from '../../../';
journey('journey 1', () => monitor.use({ id: 'duplicate id' }));
journey('journey 2', () => monitor.use({ id: 'duplicate id' }));

journey('duplicate name', () => monitor.use({ schedule: 10 }));
journey('duplicate name', () => monitor.use({ schedule: 15 }));`
    );
    const output = await runPush();
    expect(output).toContain(`Aborted: Duplicate monitors found`);
    expect(output).toContain(`duplicate id`);
    expect(output).toContain(`duplicate name`);
    await rm(dupJourney, { force: true });
  });

  it('warn if throttling config is set', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project' } },
      { locations: ['test-loc'], schedule: 3 }
    );
    const testJourney = join(PROJECT_DIR, 'test.journey.ts');
    await writeFile(
      testJourney,
      `import {journey, monitor} from '../../../';
  journey('journey 1', () => monitor.use({ throttling: {latency: 20} }));`
    );
    const output = await runPush();
    await rm(testJourney, { force: true });
    expect(output).toContain(THROTTLING_WARNING_MSG);
  });

  it('errors on duplicate lightweight monitors', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
      { locations: ['test-loc'], schedule: 3 }
    );

    const heartbeatYml = join(PROJECT_DIR, 'hearbeat.duplicate.yml');
    await writeFile(
      heartbeatYml,
      `
heartbeat.monitors:
- type: http
  schedule: @every 1m
  id: foo
  name: foo1
- type: http
  schedule: @every 2m
  id: foo
  name: foo2
    `
    );
    const output = await runPush();
    await rm(heartbeatYml, { force: true });
    expect(output).toContain(`Aborted: Duplicate monitors found`);
  });

  it('format duplicate monitors', () => {
    const duplicates = new Set([
      {
        config: { id: 'test' },
        source: { file: 'journey1.ts', line: 2, column: 5 },
      },
      {
        config: { id: 'test' },
        source: { file: 'journey2.ts', line: 10, column: 5 },
      },
    ]);
    expect(formatDuplicateError(duplicates as Set<Monitor>)).toMatchSnapshot();
  });

  it('error on invalid CHUNK SIZE', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
      { locations: ['test-loc'], schedule: 3 }
    );
    const output = await runPush(undefined, { CHUNK_SIZE: '251' });
    expect(output).toContain(
      'Invalid CHUNK_SIZE. CHUNK_SIZE must be less than or equal to 250'
    );
  });

  it('respects valid CHUNK SIZE', async () => {
    await fakeProjectSetup(
      { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
      { locations: ['test-loc'], schedule: 3 }
    );
    const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
    await writeFile(
      testJourney,
      `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
    );
    const output = await runPush([...DEFAULT_ARGS, '--tags', 'chunk'], {
      CHUNK_SIZE: '1',
    });
    await rm(testJourney, { force: true });
    expect(output).toContain('Added(2)');
    expect(output).toContain('creating or updating 1 monitors');
    expect(output).toContain('✓ Pushed:');
  });

  ['8.5.0', '8.6.0'].forEach(version => {
    describe('API: ' + version, () => {
      let server: Server;
      const deleteProgress =
        '8.5.0' === version
          ? 'deleting all stale monitors'
          : 'deleting 2 monitors';
      beforeAll(async () => {
        server = await createKibanaTestServer(version);
        await fakeProjectSetup(
          {
            project: { id: 'test-project', space: 'dummy', url: server.PREFIX },
          },
          { locations: ['test-loc'], schedule: 3 }
        );
      });
      afterAll(async () => {
        await server.close();
      });

      it('abort when delete is skipped', async () => {
        const output = await runPush([...DEFAULT_ARGS, '-y'], {
          TEST_OVERRIDE: false,
        });
        expect(output).toContain('Push command Aborted');
      });

      it('delete entire project with --yes flag', async () => {
        const output = await runPush([...DEFAULT_ARGS, '-y']);
        expect(output).toContain(deleteProgress);
      });

      it('delete entire project with prompt override', async () => {
        const output = await runPush([...DEFAULT_ARGS, '-y'], {
          TEST_OVERRIDE: true,
        });
        expect(output).toContain(deleteProgress);
      });

      it('push journeys', async () => {
        const testJourney = join(PROJECT_DIR, 'test.journey.ts');
        await writeFile(
          testJourney,
          `import {journey, monitor} from '../../../';
        journey('journey 1', () => monitor.use({ id: 'j1' }));
        journey('journey 2', () => monitor.use({ id: 'j2' }));`
        );
        const output = await runPush();
        expect(output).toContain(
          "Pushing monitors for 'test-project' project in kibana 'dummy' space"
        );
        expect(output).toContain('preparing 2 monitors');
        expect(output).toContain('creating or updating 2 monitors');
        expect(output).toContain(deleteProgress);
        expect(output).toContain('✓ Pushed:');
        await rm(testJourney, { force: true });
      });

      it('push journeys with --config', async () => {
        const testJourney = join(PROJECT_DIR, 'test.journey.ts');
        await writeFile(
          testJourney,
          `import {journey, monitor} from '../../../';
        journey('journey 1', () => monitor.use({ id: 'j1' }));`
        );
        await fakeProjectSetup(
          { project: { id: 'bar', space: 'dummy', url: server.PREFIX } },
          { locations: ['test-loc'], schedule: 3 },
          'synthetics.config.test.ts'
        );
        const output = await runPush([
          ...DEFAULT_ARGS,
          '--config',
          join(PROJECT_DIR, 'synthetics.config.test.ts'),
        ]);
        expect(output).toContain(
          "Pushing monitors for 'bar' project in kibana 'dummy' space"
        );
        await rm(testJourney, { force: true });
      });
    });
  });

  ['certPath', 'keyPath', 'pfxPath'].forEach(key => {
    it(`abort on push with clientCertificate.${key} used in cloud`, async () => {
      await fakeProjectSetup(
        {
          project: { id: 'test-project', space: 'dummy', url: server.PREFIX },
          playwrightOptions: { clientCertificates: [{ [key]: 'test.file' }] },
        },
        { locations: ['test-loc'], schedule: 3 }
      );
      const output = await runPush();
      expect(output).toMatchSnapshot();
    });
  });

  describe('Proxy options', () => {
    let requests: Array<any> = [];
    let proxyServer: Straightforward;
    let tlsServer: any;
    let proxyUrl: string;

    beforeAll(async () => {
      proxyServer = new Straightforward();
      proxyServer.onConnect.use(async ({ req }, next) => {
        requests.push(req);
        return next();
      });
      await proxyServer.listen();
      tlsServer = await createKibanaTestServer('8.6.0', true, (req: any) =>
        requests.push(req)
      );
      const server = proxyServer.server.address() as AddressInfo;
      proxyUrl = `http://localhost:${server.port}`;
    });

    afterAll(async () => {
      proxyServer.close();
      tlsServer.close();
    });

    beforeEach(() => {
      requests = [];
    });

    it('enables proxy based on HTTP_PROXY', async () => {
      await fakeProjectSetup(
        { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
        { locations: ['test-loc'], schedule: 3 }
      );
      const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
      await writeFile(
        testJourney,
        `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
      );
      const output = await runPush([...DEFAULT_ARGS, '--tags', 'chunk'], {
        CHUNK_SIZE: '1',
        HTTP_PROXY: proxyUrl,
      });
      await rm(testJourney, { force: true });
      expect(output).toContain('Added(2)');
      expect(output).toContain('creating or updating 1 monitors');
      expect(output).toContain('✓ Pushed:');
      expect(requests.length).toBeGreaterThan(0);
    });

    it('honors NO_PROXY with env variables', async () => {
      await fakeProjectSetup(
        { project: { id: 'test-project', space: 'dummy', url: server.PREFIX } },
        { locations: ['test-loc'], schedule: 3 }
      );
      const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
      await writeFile(
        testJourney,
        `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
      );
      const output = await runPush([...DEFAULT_ARGS, '--tags', 'chunk'], {
        CHUNK_SIZE: '1',
        HTTP_PROXY: proxyUrl,
        NO_PROXY: '*',
      });
      await rm(testJourney, { force: true });
      expect(output).toContain('Added(2)');
      expect(output).toContain('creating or updating 1 monitors');
      expect(output).toContain('✓ Pushed:');
      expect(requests).toHaveLength(0);
    });

    it('enables proxy based on HTTPS_PROXY', async () => {
      await fakeProjectSetup(
        {
          project: {
            id: 'test-project',
            space: 'dummy',
            url: tlsServer.PREFIX,
          },
        },
        { locations: ['test-loc'], schedule: 3 }
      );
      const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
      await writeFile(
        testJourney,
        `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
      );
      const output = await runPush([...DEFAULT_ARGS, '--tags', 'chunk'], {
        CHUNK_SIZE: '1',
        HTTPS_PROXY: proxyUrl,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      });
      await rm(testJourney, { force: true });
      expect(output).toContain('Added(2)');
      expect(output).toContain('creating or updating 1 monitors');
      expect(output).toContain('✓ Pushed:');
      expect(requests.length).toBeGreaterThan(0);
    });

    it('enables proxy based on --proxy-uri', async () => {
      await fakeProjectSetup(
        {
          project: { id: 'test-project', space: 'dummy', url: server.PREFIX },
          proxy: { uri: proxyUrl },
        },
        { locations: ['test-loc'], schedule: 3 }
      );
      const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
      await writeFile(
        testJourney,
        `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
      );
      const output = await runPush(
        [...DEFAULT_ARGS, '--tags', 'chunk', '--proxy-uri', proxyUrl],
        {
          CHUNK_SIZE: '1',
        }
      );
      await rm(testJourney, { force: true });
      expect(output).toContain('Added(2)');
      expect(output).toContain('creating or updating 1 monitors');
      expect(output).toContain('✓ Pushed:');
      expect(requests.length).toBeGreaterThan(0);
    });

    it('enables proxy based on proxy settings', async () => {
      await fakeProjectSetup(
        {
          project: { id: 'test-project', space: 'dummy', url: server.PREFIX },
          proxy: { uri: proxyUrl },
        },
        { locations: ['test-loc'], schedule: 3 }
      );
      const testJourney = join(PROJECT_DIR, 'chunk.journey.ts');
      await writeFile(
        testJourney,
        `import {journey, monitor} from '../../../';
    journey('a', () => monitor.use({ tags: ['chunk'] }));
    journey('b', () => monitor.use({ tags: ['chunk'] }));`
      );
      const output = await runPush([...DEFAULT_ARGS, '--tags', 'chunk'], {
        CHUNK_SIZE: '1',
      });
      await rm(testJourney, { force: true });
      expect(output).toContain('Added(2)');
      expect(output).toContain('creating or updating 1 monitors');
      expect(output).toContain('✓ Pushed:');
      expect(requests.length).toBeGreaterThan(0);
    });
  });
});

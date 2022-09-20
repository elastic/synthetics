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
import { APISchema } from '../../src/push/monitor';
import { Server } from '../utils/server';
import { CLIMock } from '../utils/test-config';

describe('Push', () => {
  const PROJECT_DIR = join(__dirname, 'new-project');
  const DEFAULT_ARGS = ['--auth', 'foo'];

  async function runPush(args = DEFAULT_ARGS, env?) {
    const cli = new CLIMock()
      .args(['push', ...args])
      .run({ cwd: PROJECT_DIR, env: { ...process.env, ...env } });
    await cli.exitCode;
    return cli.stderr();
  }

  async function fakeProjectSetup(settings, monitor) {
    await writeFile(
      join(PROJECT_DIR, 'synthetics.config.ts'),
      `export default { monitor: ${JSON.stringify(
        monitor
      )}, project: ${JSON.stringify(settings)} }`
    );
  }

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });
  afterAll(async () => {
    process.env.NO_COLOR = '';
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  it('error when auth is ignored', async () => {
    const output = await runPush([]);
    expect(output).toContain(`required option '--auth <auth>' not specified`);
  });

  it('error when project is not setup', async () => {
    const output = await runPush();
    expect(output).toContain(
      'Aborted (missing synthetics config file), Project not set up corrrectly.'
    );
  });

  it('error on empty project id', async () => {
    await fakeProjectSetup({}, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid location', async () => {
    await fakeProjectSetup({ id: 'test-project' }, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid schedule', async () => {
    await fakeProjectSetup({ id: 'test-project' }, { locations: ['test-loc'] });
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('abort on push with different project id', async () => {
    await fakeProjectSetup(
      { id: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush(
      [...DEFAULT_ARGS, '-y', '--id', 'new-project'],
      {
        TEST_OVERRIDE: false,
      }
    );
    expect(output).toContain('Push command Aborted');
  });

  it('push with different id when overriden', async () => {
    await fakeProjectSetup(
      { id: 'test-project', space: 'dummy', url: 'http://localhost:8080' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const testJourney = join(PROJECT_DIR, 'test.journey.ts');
    await writeFile(
      testJourney,
      `import {journey, monitor} from '../../../src/index';
journey('journey 1', () => monitor.use({ id: 'j1' }));`
    );
    const output = await runPush(
      [...DEFAULT_ARGS, '-y', '--id', 'new-project'],
      {
        TEST_OVERRIDE: true,
      }
    );
    expect(output).toContain('preparing all monitors');
    await rm(testJourney, { force: true });
  });

  it('errors on duplicate browser monitors', async () => {
    await fakeProjectSetup(
      { id: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
    );

    const dupJourney = join(PROJECT_DIR, 'duplicate.journey.ts');
    await writeFile(
      dupJourney,
      `import {journey, monitor} from '../../../src';
journey('journey 1', () => monitor.use({ id: 'duplicate id' }));
journey('journey 2', () => monitor.use({ id: 'duplicate id' }));

journey('duplicate name', () => monitor.use({ schedule: 10 }));
journey('duplicate name', () => monitor.use({ schedule: 20 }));`
    );
    const output = await runPush();
    expect(output).toContain(`Aborted: Duplicate monitors found`);
    expect(output).toContain(`duplicate id`);
    expect(output).toContain(`duplicate name`);
    await rm(dupJourney, { force: true });
  });

  it('errors on duplicate browser monitors', async () => {
    await fakeProjectSetup(
      { id: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
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
    expect(output).toContain(`Aborted: Duplicate monitors found`);
    await rm(heartbeatYml, { force: true });
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

  it('abort when delete is skipped', async () => {
    await fakeProjectSetup(
      { id: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush([...DEFAULT_ARGS, '-y'], {
      TEST_OVERRIDE: false,
    });
    expect(output).toContain('Push command Aborted');
  });

  it('delete entire project with --yes flag', async () => {
    await fakeProjectSetup(
      { id: 'test-project', space: 'dummy', url: 'http://localhost:8080' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush([...DEFAULT_ARGS, '-y']);
    expect(output).toContain('deleting all stale monitors');
  });

  it('delete entire project with overrides', async () => {
    await fakeProjectSetup(
      { id: 'test-project', space: 'dummy', url: 'http://localhost:8080' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush([...DEFAULT_ARGS, '-y'], {
      TEST_OVERRIDE: true,
    });
    expect(output).toContain('deleting all stale monitors');
  });

  describe('API', () => {
    let server: Server;
    beforeAll(async () => {
      server = await Server.create();
      const apiRes = { failedMonitors: [], failedStaleMonitors: [] };
      server.route(
        '/sync/s/dummy/api/synthetics/service/project/monitors',
        (req, res) => {
          res.end(JSON.stringify(apiRes));
        }
      );
      server.route(
        '/stream/s/dummy/api/synthetics/service/project/monitors',
        async (req, res) => {
          await new Promise(r => setTimeout(r, 20));
          req.on('data', chunks => {
            const schema = JSON.parse(chunks.toString()) as APISchema;
            res.write(JSON.stringify(schema.monitors[0].name) + '\n');
          });
          req.on('end', () => {
            res.end(JSON.stringify(apiRes));
          });
        }
      );
      await fakeProjectSetup(
        {
          id: 'test-project',
          space: 'dummy',
        },
        { locations: ['test-loc'], schedule: 2 }
      );

      await writeFile(
        join(PROJECT_DIR, 'test.journey.ts'),
        `import {journey, monitor} from '../../../src/index';
journey('journey 1', () => monitor.use({ id: 'j1' }));
journey('journey 2', () => monitor.use({ id: 'j2' }));`
      );
    });
    afterAll(async () => {
      await server.close();
    });

    it('handle sync response', async () => {
      const output = await runPush([
        '--url',
        server.PREFIX + '/sync',
        ...DEFAULT_ARGS,
      ]);
      expect(output).toMatchSnapshot();
    });
    it('handle streamed response', async () => {
      const output = await runPush([
        '--url',
        server.PREFIX + '/stream',
        ...DEFAULT_ARGS,
      ]);
      expect(output).toMatchSnapshot();
    });
  });
});

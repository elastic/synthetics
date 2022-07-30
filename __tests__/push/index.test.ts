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
import { CLIMock } from '../utils/test-config';

describe('Push CLI', () => {
  const PROJECT_DIR = join(__dirname, 'new-project');
  const DEFAULT_ARGS = ['--auth', 'foo'];

  async function runPush(args = DEFAULT_ARGS, env?) {
    const cli = new CLIMock()
      .args(['push', ...args])
      .run({ cwd: PROJECT_DIR, env: { ...process.env, ...env } });
    expect(await cli.exitCode).toBe(1);
    return cli.stderr();
  }

  async function fakeProjectSetup(settings, monitor) {
    await mkdir(join(PROJECT_DIR, '.synthetics'), { recursive: true });
    await writeFile(
      join(PROJECT_DIR, '.synthetics', 'project.json'),
      JSON.stringify(settings, null, 2)
    );

    await writeFile(
      join(PROJECT_DIR, 'synthetics.config.ts'),
      `export default { monitor: ${JSON.stringify(monitor)} }`
    );
  }

  beforeAll(async () => {
    process.env.NO_COLOR = '1';
    await mkdir(PROJECT_DIR, { recursive: true });
  });
  afterAll(async () => {
    process.env.NO_COLOR = '0';
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  it('error when auth is ignored', async () => {
    const output = await runPush([]);
    expect(output).toContain(`required option '--auth <auth>' not specified`);
  });

  it('error when project is not setup', async () => {
    const output = await runPush();
    expect(output).toContain('Aborted. Synthetics project not set up');
  });

  it('error on empty project id', async () => {
    await fakeProjectSetup({}, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid location', async () => {
    await fakeProjectSetup({ project: 'test-project' }, {});
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('error on invalid schedule', async () => {
    await fakeProjectSetup(
      { project: 'test-project' },
      { locations: ['test-loc'] }
    );
    const output = await runPush();
    expect(output).toMatchSnapshot();
  });

  it('abort on push with different project id', async () => {
    await fakeProjectSetup(
      { project: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush(
      [...DEFAULT_ARGS, '--project', 'new-project'],
      {
        TEST_OVERRIDE: '',
      }
    );
    expect(output).toMatchSnapshot();
  });

  it('push with different id when overriden', async () => {
    await fakeProjectSetup(
      { project: 'test-project' },
      { locations: ['test-loc'], schedule: 2 }
    );
    const output = await runPush(
      [...DEFAULT_ARGS, '--project', 'new-project'],
      {
        TEST_OVERRIDE: 'true',
      }
    );
    expect(output).toContain('No Monitors found');
  });
});

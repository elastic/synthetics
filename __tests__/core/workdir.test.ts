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

import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { join, relative } from 'path';
import '../../src/core/gatherer';
import Runner from '../../src/core/runner';
import { CACHE_PATH, getCachePath } from '../../src/helpers';

describe('runtime workdir', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'synthetics-workdir-test-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('preserves the default and resolves relative paths', () => {
    expect(getCachePath()).toBe(CACHE_PATH);
    expect(getCachePath(relative(process.cwd(), workdir))).toBe(
      join(workdir, process.pid.toString())
    );
  });

  it('creates the selected cache before hooks and only removes its own cache', async () => {
    const runner = new Runner();
    const cache = getCachePath(workdir);
    const marker = join(workdir, 'heartbeat-owned');
    await writeFile(marker, 'keep');
    const hook = jest.fn(async () => {
      expect((await stat(cache)).isDirectory()).toBe(true);
      await writeFile(join(cache, 'scratch'), 'temporary');
    });
    runner.hooks.beforeAll.push(hook);
    await runner._run({ workdir, dryRun: true });
    expect(hook).toHaveBeenCalled();
    await expect(stat(cache)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(marker, 'utf8')).toBe('keep');
  });

  it('accepts --workdir through the CLI', async () => {
    const selected = join(workdir, 'cli-cache');
    const result = spawnSync(
      process.execPath,
      [
        join(__dirname, '../../dist/cli.js'),
        '--inline',
        '--dry-run',
        '--workdir',
        selected,
      ],
      { input: "step('example', async () => {});", encoding: 'utf8' }
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect((await stat(selected)).isDirectory()).toBe(true);
  });

  it('propagates initialization errors and allows a subsequent run', async () => {
    const runner = new Runner();
    const file = join(workdir, 'file');
    await writeFile(file, 'not a directory');
    await expect(
      runner._run({ workdir: file, dryRun: true })
    ).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
    const hook = jest.fn();
    runner.hooks.beforeAll.push(hook);
    await runner._run({ workdir, dryRun: true });
    expect(hook).toHaveBeenCalled();
  });
});

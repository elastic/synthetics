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

import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';

describe('CLI', () => {
  const FIXTURES_DIR = join(__dirname, 'fixtures');
  it('run suites and exit with 0', async () => {
    const cli = new CLIMock([join(FIXTURES_DIR, 'fake.journey.ts')]);
    await cli.waitFor('Journey: fake journey');
    expect(cli.output()).toContain('fake journey');
    expect(await cli.exitCode).toBe(0);
  });

  it('run suites and exit with 1', async () => {
    const cli = new CLIMock([join(FIXTURES_DIR, 'error.journey.ts')]);
    await cli.waitFor('boom');
    expect(await cli.exitCode).toBe(1);
  });

  it('produce json output via --json flag', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'fake.journey.ts'),
      '--reporter',
      'json',
    ]);
    await cli.waitFor('fake journey');
    const output = cli.output();
    expect(JSON.parse(output).journey).toEqual({
      id: 'fake journey',
      name: 'fake journey',
    });
    expect(await cli.exitCode).toBe(0);
  });

  it('mimick heartbeat with `--rich-events` flag', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'fake.journey.ts'),
      '--rich-events',
    ]);
    await cli.waitFor('journey/end');
    const screenshotRef = cli
      .buffer()
      .map(data => JSON.parse(data))
      .find(({ type }) => type === 'step/screenshot_ref');

    expect(screenshotRef).toMatchObject({
      journey: {
        id: 'fake journey',
        name: 'fake journey',
      },
      root_fields: expect.any(Object),
    });

    expect(await cli.exitCode).toBe(0);
  });

  it('override screenshots with `--rich-events` flag', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'fake.journey.ts'),
      '--rich-events',
      '--screenshots',
      'off',
    ]);
    await cli.waitFor('journey/end');
    const screenshots = cli
      .buffer()
      .map(data => JSON.parse(data))
      .find(({ type }) => type === 'step/screenshot_ref');
    expect(screenshots).not.toBeDefined();
    expect(await cli.exitCode).toBe(0);
  });

  it('pass dynamic config to journey params', async () => {
    // jest by default sets NODE_ENV to `test`
    const original = process.env['NODE_ENV'];
    const output = async () => {
      const cli = new CLIMock([
        join(FIXTURES_DIR, 'fake.journey.ts'),
        '--reporter',
        'json',
        '--config',
        join(FIXTURES_DIR, 'synthetics.config.ts'),
      ]);
      await cli.waitFor('journey/start');
      expect(await cli.exitCode).toBe(0);
      return cli.output();
    };

    expect(JSON.parse(await output()).payload).toMatchObject({
      params: { url: 'non-dev' },
    });
    process.env['NODE_ENV'] = 'development';
    expect(JSON.parse(await output()).payload).toMatchObject({
      params: { url: 'dev' },
    });
    process.env['NODE_ENV'] = original;
  });

  it('pass playwright options to runner', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'pwoptions.journey.ts'),
      '--reporter',
      'json',
      '--config',
      join(FIXTURES_DIR, 'synthetics.config.ts'),
    ]);
    await cli.waitFor('step/end');
    const output = cli.output();
    expect(await cli.exitCode).toBe(0);
    expect(JSON.parse(output).step).toMatchObject({
      status: 'succeeded',
    });
  });

  it('suite params wins over config params', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'fake.journey.ts'),
      '--reporter',
      'json',
      '--config',
      join(FIXTURES_DIR, 'synthetics.config.ts'),
      '-s',
      '{"url": "suite-url"}',
    ]);
    await cli.waitFor('journey/start');
    const output = cli.output();
    expect(await cli.exitCode).toBe(0);
    expect(JSON.parse(output).payload).toMatchObject({
      params: { url: 'suite-url' },
    });
  });

  it('throw error on modifying params', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'params-error.journey.ts'),
      '--reporter',
      'json',
    ]);
    expect(await cli.exitCode).toBe(1);
    const output = cli.output();
    expect(JSON.parse(output).error).toMatchObject({
      name: 'TypeError',
      message: 'Cannot add property foo, object is not extensible',
    });
  });

  it('support capability flag', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'example.journey.ts'),
      '--reporter',
      'json',
      '--capability',
      'metrics',
    ]);
    await cli.waitFor('step/end');
    const output = JSON.parse(cli.output());
    expect(output.payload.metrics).toBeDefined();
    expect(await cli.exitCode).toBe(0);
  });

  it('show warn for unknown capability flag', async () => {
    const cli = new CLIMock([
      join(FIXTURES_DIR, 'fake.journey.ts'),
      '--reporter',
      'json',
      '--capability',
      'unknown',
    ]);
    try {
      await cli.exitCode;
    } catch (e) {
      expect(e.message).toMatch('Missing capability "unknown"');
    }
  });

  it('run expect assetions with type check', async () => {
    // flag turns on type checking
    process.env['TS_NODE_TYPE_CHECK'] = 'true';
    const cli = new CLIMock([join(FIXTURES_DIR, 'expect.journey.ts')]);
    expect(await cli.exitCode).toBe(0);
    process.env['TS_NODE_TYPE_CHECK'] = 'false';
  });
});

class CLIMock {
  private process: ChildProcess;
  private data = '';
  private chunks: Array<string> = [];
  private waitForText: string;
  private waitForPromise: () => void;
  exitCode: Promise<number>;

  constructor(args: string[]) {
    this.process = spawn(
      'node',
      [join(__dirname, '..', 'dist', 'cli.js'), ...args],
      {
        env: process.env,
        stdio: 'pipe',
      }
    );
    const dataListener = data => {
      this.data = data.toString();
      this.chunks.push(...this.data.split('\n').filter(Boolean));
      if (this.waitForPromise && this.data.includes(this.waitForText)) {
        this.process.stdout.off('data', dataListener);
        this.waitForPromise();
      }
    };
    this.process.stdout.on('data', dataListener);

    this.exitCode = new Promise((res, rej) => {
      this.process.stderr.on('data', data => rej(new Error(data)));
      this.process.on('exit', code => res(code));
    });
  }

  async waitFor(text: string): Promise<void> {
    this.waitForText = text;
    return new Promise(r => (this.waitForPromise = r));
  }

  output() {
    return this.data;
  }

  buffer() {
    return this.chunks;
  }
}

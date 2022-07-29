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

import { existsSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { CLIMock } from '../utils/test-config';
import { regularFiles } from '../../src/generator';

describe('Generator', () => {
  const scaffoldDir = join(__dirname, 'scaffold-test');
  beforeAll(() => {
    // Not useful for this particular test and delays the test itself
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
  });
  afterAll(async () => {
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '0';
    await rm(scaffoldDir, {
      recursive: true,
      force: true,
    });
  });
  it('generate synthetics project - NPM', async () => {
    // In a few development environments, this test may take
    // a few millisseconds more than the default 15000ms timeout
    jest.setTimeout(30000);
    const cli = new CLIMock().args(['init', scaffoldDir]).run({
      env: {
        ...process.env,
        TEST_QUESTIONS: JSON.stringify({
          locations: 'us_east',
          schedule: 30,
        }),
      },
    });
    const output = await cli.buffer().join('\n');
    const exitCode = await cli.exitCode;
    // This check is lame, but showing the exit code does nothing to diagnose the issue
    if (exitCode !== 0) {
      expect(output).toBe('');
    }

    // Verify files
    expect(existsSync(join(scaffoldDir, 'package.json'))).toBeTruthy();
    expect(existsSync(join(scaffoldDir, 'package-lock.json'))).toBeTruthy();
    expect(existsSync(join(scaffoldDir, '.gitignore'))).toBeTruthy();

    // Verify gitignore contents
    expect(await readFile(join(scaffoldDir, '.gitignore'), 'utf-8'))
      .toMatchInlineSnapshot(`
      "node_modules/
      .synthetics/
      "
    `);

    regularFiles.forEach(fn => {
      expect(existsSync(join(scaffoldDir, fn))).toBeTruthy();
    });
    expect(existsSync(join(scaffoldDir, 'synthetics.config.ts'))).toBeTruthy();
    // Verify schedule and locations
    const configFile = await readFile(
      join(scaffoldDir, 'synthetics.config.ts'),
      'utf-8'
    );
    expect(configFile).toContain(`locations: [us_east]`);
    expect(configFile).toContain(`schedule: 30`);

    // Verify stdout
    const stderr = cli.stderr();
    expect(stderr).toContain('Initializing Synthetics project using NPM');
    expect(stderr).toContain('Installing @elastic/synthetics library');
    expect(stderr).toContain('All set, you can run below commands');
  }, 30000);
});

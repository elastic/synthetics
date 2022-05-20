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
import { rm } from 'fs/promises';
import { join } from 'path';
import { CLIMock } from '../utils/test-config';

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
    const cli = new CLIMock().args(['init', scaffoldDir]).run();
    expect(await cli.exitCode).toBe(0);

    // Verify files
    expect(existsSync(join(scaffoldDir, 'package.json'))).toBeTruthy();
    expect(existsSync(join(scaffoldDir, 'package-lock.json'))).toBeTruthy();
    expect(existsSync(join(scaffoldDir, '.gitignore'))).toBeTruthy();
    expect(
      existsSync(join(scaffoldDir, 'journeys', 'example.journey.ts'))
    ).toBeTruthy();
    expect(existsSync(join(scaffoldDir, 'synthetics.config.ts'))).toBeTruthy();

    // Verify stdout
    const stderr = cli.stderr();
    expect(stderr).toContain('Initializing Synthetics project using NPM');
    expect(stderr).toContain('Installing @elastic/synthetics library');
    expect(stderr).toContain('All set, you can run below commands');
  }, 30000);
});

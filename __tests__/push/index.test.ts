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

import { join } from 'path';
import { CLIMock } from '../utils/test-config';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

describe('Push CLI', () => {
  const args = ['--auth', 'foo'];

  it('error when auth is ignored', async () => {
    const cli = new CLIMock().args(['push']).run({ cwd: FIXTURES_DIR });
    expect(await cli.exitCode).toBe(1);

    expect(cli.stderr()).toContain(
      `required option '--auth <auth>' not specified`
    );
  });

  it('error when project is not setup', async () => {
    const cli = new CLIMock()
      .args(['push', ...args])
      .run({ cwd: FIXTURES_DIR });
    expect(await cli.exitCode).toBe(1);

    expect(cli.stderr()).toContain('Aborted. Synthetics project not set up');
  });
});

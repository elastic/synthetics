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
import { devices } from 'playwright-chromium';
import { generateTempPath } from '../src/helpers';
import { readConfig } from '../src/config';

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('Config', () => {
  it('read config based on environment', async () => {
    const configPath = join(FIXTURES_DIR, 'synthetics.config.ts');
    expect(await readConfig('development', configPath)).toMatchObject({
      params: {
        url: 'dev',
      },
      playwrightOptions: {
        ...devices['Galaxy S9+'],
      },
    });
    expect(await readConfig('testing', configPath)).toMatchObject({
      params: {
        url: 'non-dev',
      },
    });
  });

  it('throw error when config does not exist', async () => {
    const tempPath = generateTempPath();
    expect(readConfig('development', tempPath)).rejects.toThrow(
      new Error('Synthetics config file does not exist: ' + tempPath)
    );
  });

  it('recursively look for configs and exit', async () => {
    expect(await readConfig('development')).toEqual({});
  });

  describe('read config async', () => {
    it('merge async config', async () => {
      const configPath = join(FIXTURES_DIR, 'async-params.config.ts');
      expect(await readConfig('development', configPath)).toMatchObject({
        params: {
          url: 'dev',
        },
      });
      expect(await readConfig('testing', configPath)).toMatchObject({
        params: {
          url: 'non-dev',
        },
      });
    });

    it('catch errors on async config', async () => {
      const configPath = join(FIXTURES_DIR, 'async-params-err.config.ts');
      expect(readConfig('development', configPath)).rejects.toThrow(
        'failed to fetch params'
      );
    });
  });
});

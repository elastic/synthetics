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

import { CliArgs } from '../src/common_types';
import { normalizeOptions } from '../src/options';
import { join } from 'path';

describe('options', () => {
  it('normalize', async () => {
    const cliArgs: CliArgs = {
      params: {
        foo: 'bar',
      },
      headless: true,
      sandbox: false,
      screenshots: 'on',
      dryRun: true,
      match: 'check*',
      pauseOnError: true,
      config: join(__dirname, 'fixtures', 'synthetics.config.ts'),
    };
    expect(normalizeOptions({})).toMatchObject({
      environment: 'test',
      params: {},
    });
    expect(normalizeOptions(cliArgs)).toMatchObject({
      dryRun: true,
      environment: 'test',
      match: 'check*',
      params: {
        foo: 'bar',
        url: 'non-dev',
      },
      pauseOnError: true,
      playwrightOptions: {
        chromiumSandbox: false,
        defaultBrowserType: 'chromium',
        deviceScaleFactor: 4.5,
        hasTouch: true,
        headless: true,
        ignoreHTTPSErrors: undefined,
        isMobile: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4929.0 Mobile Safari/537.36',
        viewport: {
          height: 658,
          width: 320,
        },
      },
      screenshots: 'on',
    });
  });
});

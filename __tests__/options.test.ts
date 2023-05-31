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
import { devices } from 'playwright-chromium';

describe('options', () => {
  it('normalize', () => {
    const cliArgs: CliArgs = {
      params: {
        foo: 'bar',
      },
      playwrightOptions: {
        headless: false,
      },
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
        headless: false,
        ignoreHTTPSErrors: undefined,
        isMobile: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.29 Mobile Safari/537.36',
        viewport: {
          height: 658,
          width: 320,
        },
      },
      screenshots: 'on',
    });
  });

  it('normalize monitor configs', () => {
    expect(
      normalizeOptions({
        schedule: 3,
        privateLocations: ['test'],
        locations: ['australia_east'],
      })
    ).toMatchObject({
      schedule: 3,
      privateLocations: ['test'],
      locations: ['australia_east'],
    });
  });

  it('normalize monitor configs defined in the config file', () => {
    const cliArgs: CliArgs = {
      config: join(__dirname, 'fixtures', 'synthetics.config.ts'),
    };

    expect(normalizeOptions(cliArgs)).toEqual(
      expect.objectContaining({
        schedule: 5,
        tags: ['test-tag'],
        locations: ['us_west'],
        privateLocations: ['test-private-location'],
      })
    );
  });

  it('CLI flags prevail over the options defined in the config file', () => {
    const cliArgs: CliArgs = {
      config: join(__dirname, 'fixtures', 'synthetics.config.ts'),
      params: {
        url: 'test-dev',
      },
      schedule: 3,
      tags: ['cli-test-tag'],
      locations: ['brazil'],
      privateLocations: ['cli-test-private-location'],
    };

    expect(normalizeOptions(cliArgs)).toEqual(
      expect.objectContaining({
        params: cliArgs.params,
        schedule: cliArgs.schedule,
        tags: cliArgs.tags,
        locations: cliArgs.locations,
        privateLocations: cliArgs.privateLocations,
      })
    );
  });

  it('merges CLI playwrightOptions with the ones defined in the config file', () => {
    const cliArgs: CliArgs = {
      config: join(__dirname, 'fixtures', 'synthetics.config.ts'),
      playwrightOptions: {
        testIdAttribute: 'test-id-attribute',
        chromiumSandbox: true,
        ignoreHTTPSErrors: false,
      },
    };

    expect(normalizeOptions(cliArgs).playwrightOptions).toEqual({
      ...devices['Galaxy S9+'],
      testIdAttribute: cliArgs.playwrightOptions.testIdAttribute,
      chromiumSandbox: cliArgs.playwrightOptions.chromiumSandbox,
      ignoreHTTPSErrors: cliArgs.playwrightOptions.ignoreHTTPSErrors,
    });
  });
});

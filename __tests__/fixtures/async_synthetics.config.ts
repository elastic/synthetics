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

import { devices } from 'playwright-chromium';
import type { SyntheticsConfig } from '../../src';

const getParams = async () => {
  // return delayed promise to simulate async
  return new Promise<Record<string, string>>(resolve => {
    setTimeout(() => {
      resolve({
        url: 'dev',
      });
    }, 1000);
  });
};

module.exports = async env => {
  const config: SyntheticsConfig = {
    params: await getParams(),
    playwrightOptions: {
      ...devices['Galaxy S9+'],
    },
    monitor: {
      screenshot: 'off',
      schedule: 10,
      locations: ['us_east'],
      privateLocations: ['test-location'],
      alert: {
        status: {
          enabled: true,
        },
        tls: {
          enabled: false,
        },
      },
    },
  };
  if (env !== 'development' && config.params) {
    config.params.url = 'non-dev';
  }
  return config;
};

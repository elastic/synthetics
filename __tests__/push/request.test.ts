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

process.env.NO_COLOR = '1';

import {
  APIMonitorError,
  formatAPIError,
  formatFailedMonitors,
  formatNotFoundError,
} from '../../src/push/request';

describe('Push api request', () => {
  it('format api error', () => {
    const { statusCode, error, message } = {
      statusCode: 401,
      error: 'Unauthorized',
      message:
        '[security_exception: [security_exception] Reason: unable to authenticate user',
    };

    expect(formatAPIError(statusCode, error, message)).toMatchSnapshot();
  });

  it('format 404 error', () => {
    const message = 'Not Found';
    expect(formatNotFoundError(message)).toMatchSnapshot();
  });

  it('format failed monitors', () => {
    const errors: APIMonitorError[] = [
      {
        id: 'monitor-without-schedule',
        reason: 'Failed to save or update monitor. Configuration is not valid',
        details: `Invalid value "undefined" supplied to "schedule"`,
      },
      {
        reason: 'Failed to save or update monitor. Configuration is not valid',
        details: `Invalid value "undefined" supplied to "id"`,
      },
    ];

    expect(formatFailedMonitors(errors)).toMatchSnapshot();
  });
});

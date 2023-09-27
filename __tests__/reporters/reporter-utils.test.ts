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

import {
  prepareError,
  serializeError,
  stripAnsiCodes,
} from '../../src/reporters/reporter-util';

describe('Reporter utils', () => {
  const error = new Error('test error');
  error.stack = `Error: test error
    at Step.callback (/tmp/elastic-synthetics-unzip-3180424903/journeys/journeys/errors.journey.ts:15:11)
    at runNextTicks (node:internal/process/task_queues:60:5)
    at processImmediate (node:internal/timers:447:9)
    at Runner.runStep (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:213:7)
    at Runner.runSteps (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:263:16)
    at Runner.runJourney (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:353:27)
    at Runner.run (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/core/runner.ts:446:11)
    at Command.<anonymous> (/usr/share/heartbeat/.node/node/lib/node_modules/@elastic/synthetics/src/cli.ts:138:23)
  `;

  it('prepare error', () => {
    const err = prepareError(error);
    expect(err.message).toBe('Error: test error');
    expect(err).toEqual({
      message: 'Error: test error',
      stack:
        '    at Step.callback (/tmp/elastic-synthetics-unzip-3180424903/journeys/errors.journey.ts:15:11)',
      location: {
        file: '/tmp/elastic-synthetics-unzip-3180424903/journeys/errors.journey.ts',
        column: 11,
        line: 15,
      },
    });
  });

  it('serialize error', () => {
    const error = new Error('test error');
    const err = serializeError(error);
    expect(err.source).toBeUndefined();
  });

  describe('render error', () => {
    beforeAll(() => {
      process.env['TEST_OVERRIDE'] = 'true';
    });
    afterAll(() => {
      process.env['TEST_OVERRIDE'] = undefined;
    });

    it('highlight source', () => {
      const error = new Error('test error');
      const err = serializeError(error);
      expect(stripAnsiCodes(err.source)).toMatchSnapshot();
    });
  });
});

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

import { run } from '../src/index';
import { runner } from '../src/core';
import * as ParseArgs from '../src/parse_args';

describe('run', () => {
  let runnerSpy: jest.SpyInstance;
  let parseArgsSpy: jest.SpyInstance;

  beforeEach(() => {
    runnerSpy = jest
      .spyOn(runner, 'run')
      .mockImplementation(() => Promise.resolve({}));
    parseArgsSpy = jest.spyOn(ParseArgs, 'parseArgs');
  });

  it('uses undefined options when none specified', async () => {
    parseArgsSpy.mockImplementation(() => ({}));
    await run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      dryRun: undefined,
      environment: 'debug',
      headless: undefined,
      journeyName: undefined,
      network: undefined,
      params: {},
      pauseOnError: undefined,
      screenshots: undefined,
      outfd: undefined,
      reporter: undefined,
    });
  });

  it('uses specified option values', async () => {
    const reporter: 'default' | 'json' = 'json';
    const runParams = {
      params: {},
      environment: 'debug',
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true,
      outfd: undefined,
      reporter,
    };
    await run(runParams);
    expect(runnerSpy.mock.calls[0][0]).toEqual(runParams);
  });

  it('uses cli args if some options are not specified', async () => {
    parseArgsSpy.mockImplementation(() => {
      return {
        headless: true,
        screenshots: true,
        dryRun: true,
        journeyName: 'There and Back Again',
        network: true,
        pauseOnError: true,
        reporter: undefined,
        outfd: undefined,
      } as any;
    });

    await run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      dryRun: true,
      environment: 'debug',
      headless: true,
      journeyName: 'There and Back Again',
      network: true,
      params: {},
      pauseOnError: true,
      screenshots: true,
      reporter: undefined,
      outfd: undefined,
    });
  });
});

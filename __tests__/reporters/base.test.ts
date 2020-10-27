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

/**
 * Disable the ANSI codes for kleur/colors module
 */
process.env.NO_COLOR = '1';

import fs from 'fs';
import { runner, step, journey } from '../../src/core';
import BaseReporter from '../../src/reporters/base';
import * as helpers from '../../src/helpers';

describe('base reporter', () => {
  const dest = helpers.generateTempPath();
  afterAll(() => {
    fs.unlinkSync(dest);
    process.env.NO_COLOR = '';
  });

  it('writes each step to the FD', async () => {
    const timestamp = 1600300800000000;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
    const { stream } = new BaseReporter(runner, { fd: fs.openSync(dest, 'w') });
    runner.emit('start', { numJourneys: 1 });
    const j1 = journey('j1', async () => {});
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp,
    });
    const error = {
      name: 'Error',
      message: 'step failed',
      stack: 'Error: step failed',
    };
    runner.emit('step:end', {
      journey: j1,
      status: 'failed',
      error,
      step: step('s1', async () => {}),
      url: 'dummy',
      start: 0,
      end: 1,
      timestamp,
    });
    runner.emit('end', 'done');
    /**
     * Close the underyling stream writing to FD to read all its contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd);
    expect(buffer.toString()).toMatchSnapshot();
  });
});

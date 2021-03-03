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

import fs from 'fs';
import { runner, step, journey } from '../../src/core';
import JUnitReporter from '../../src/reporters/junit';
import * as helpers from '../../src/helpers';

describe('base reporter', () => {
  const dest = helpers.generateTempPath();
  afterAll(() => fs.unlinkSync(dest));

  it('writes each step to the FD', async () => {
    const timestamp = 1600300800000000;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
    const { stream } = new JUnitReporter(runner, {
      fd: fs.openSync(dest, 'w'),
    });
    const j1 = journey('j1', async () => {});
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp,
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'failed',
      error: new Error('Boom'),
      step: step('s1', async () => {}),
      start: 0,
      end: 1,
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'skipped',
      step: step('s2', async () => {}),
      start: 0,
      end: 1,
    });
    runner.emit('journey:end', {
      journey: j1,
      start: 0,
      status: 'failed',
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

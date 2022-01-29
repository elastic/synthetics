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
import { step, journey } from '../../src/core';
import Runner from '../../src/core/runner';
import BaseReporter from '../../src/reporters/base';
import * as helpers from '../../src/helpers';

describe('base reporter', () => {
  let dest: string;
  let stream;
  let runner: Runner;
  const timestamp = 1600300800000000;
  const j1 = journey('j1', () => {});

  beforeEach(() => {
    runner = new Runner();
    dest = helpers.generateTempPath();
    stream = new BaseReporter(runner, { fd: fs.openSync(dest, 'w') }).stream;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
  });

  afterEach(() => {
    fs.unlinkSync(dest);
  });

  afterAll(() => {
    process.env.NO_COLOR = '';
  });

  it('writes each step to the FD', async () => {
    runner.emit('start', { numJourneys: 1 });
    runner.emit('journey:start', {
      journey: j1,
      params: { environment: 'testing' },
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
      step: step('s1', () => {}),
      url: 'dummy',
      start: 0,
      end: 1,
    });
    runner.emit('end', 'done');
    /**
     * Close the underyling stream writing to FD to read all its contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const buffer = fs.readFileSync(fs.openSync(dest, 'r'));
    expect(buffer.toString()).toMatchSnapshot();
  });

  it('render hook errors without steps', async () => {
    runner.emit('start', { numJourneys: 1 });
    runner.emit('journey:start', {
      journey: j1,
      params: { environment: 'testing' },
      timestamp,
    });
    const error = {
      name: 'Error',
      message: 'before hook failed',
      stack: 'Error: before hook failed',
    };
    runner.emit('journey:end', {
      journey: j1,
      timestamp,
      status: 'failed',
      error,
      start: 0,
      end: 1,
      options: {},
    });
    runner.emit('end', 'done');
    /**
     * Close the underyling stream writing to FD to read all its contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const buffer = fs.readFileSync(fs.openSync(dest, 'r'));
    expect(buffer.toString()).toMatchSnapshot();
  });
});

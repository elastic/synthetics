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
import SonicBoom from 'sonic-boom';
import { step, journey } from '../../src/core';
import BaseReporter from '../../src/reporters/base';
import * as helpers from '../../src/helpers';

describe('base reporter', () => {
  let dest: string;
  let stream: SonicBoom;
  let reporter: BaseReporter;
  const timestamp = 1600300800000000;
  const j1 = journey('j1', () => {});

  const readAndCloseStream = async () => {
    /**
     * Close the underlying stream writing to FD to read all the contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    return fs.readFileSync(fs.openSync(dest, 'r'), 'utf-8');
  };

  beforeEach(() => {
    dest = helpers.generateTempPath();
    reporter = new BaseReporter({ fd: fs.openSync(dest, 'w') });
    stream = reporter.stream;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
  });

  afterEach(() => {
    fs.unlinkSync(dest);
  });

  afterAll(() => {
    process.env.NO_COLOR = '';
  });

  it('writes each step to the FD', async () => {
    reporter.onJourneyStart(j1, {
      timestamp,
    });
    reporter.onStepEnd(j1, step('s1', helpers.noop), {
      status: 'failed',
      error: {
        name: 'Error',
        message: 'step failed',
        stack: 'Error: step failed',
      },
      url: 'dummy',
      start: 0,
      end: 1,
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('render hook errors without steps', async () => {
    reporter.onJourneyStart(j1, {
      timestamp,
    });
    const error = {
      name: 'Error',
      message: 'before hook failed',
      stack: 'Error: before hook failed',
    };
    reporter.onJourneyEnd(j1, {
      timestamp,
      status: 'failed',
      error,
      start: 0,
      end: 1,
      options: {},
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });
});

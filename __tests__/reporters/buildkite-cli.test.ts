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

import * as fs from 'fs';
import SonicBoom from 'sonic-boom';
import BuildKiteCLIReporter from '../../src/reporters/build_kite_cli';
import * as helpers from '../../src/helpers';
import { tJourney, tStep } from '../utils/test-config';

describe('buildkite cli reporter', () => {
  let dest: string;
  let stream: SonicBoom;
  let reporter: BuildKiteCLIReporter;
  const timestamp = 1600300800000000;

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
    reporter = new BuildKiteCLIReporter({ fd: fs.openSync(dest, 'w') });
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
    const error = {
      name: 'Error',
      message: 'step failed',
      stack: 'Error: step failed',
    };
    const j1 = tJourney('failed', 1, error);
    const s1 = tStep('failed', 1, error, 'dummy');
    reporter.onJourneyStart(j1, { timestamp });
    reporter.onStepEnd(j1, s1, {});
    reporter.onJourneyEnd(j1, {
      timestamp,
      browserDelay: 0,
      options: {},
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('render hook errors without steps', async () => {
    const error = {
      name: 'Error',
      message: 'before hook failed',
      stack: 'Error: before hook failed',
    };
    const j1 = tJourney('failed', 1, error);
    reporter.onJourneyStart(j1, {
      timestamp,
    });

    reporter.onJourneyEnd(j1, {
      timestamp,
      browserDelay: 0,
      options: {},
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('writes multiple steps to the FD', async () => {
    const j1 = tJourney('succeeded', 2);
    const s1 = tStep('succeeded', 1, undefined, 'dummy');
    const s2 = tStep('succeeded', 4, undefined, 'http://localhost:8080');
    reporter.onJourneyStart(j1, { timestamp });
    reporter.onStepEnd(j1, s1, {});
    reporter.onStepEnd(j1, s2, {});
    reporter.onJourneyEnd(j1, {
      timestamp,
      browserDelay: 0,
      options: {},
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });
});

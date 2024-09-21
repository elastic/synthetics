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
import { join } from 'path';
import SonicBoom from 'sonic-boom';
import JUnitReporter from '../../src/reporters/junit';
import * as helpers from '../../src/helpers';
import { tJourney, tStep } from "../utils/test-config"

describe('junit reporter', () => {
  beforeEach(() => { });
  let dest: string;
  let stream: SonicBoom;
  let reporter: JUnitReporter;
  const timestamp = 1600300800000000;

  beforeEach(() => {
    dest = helpers.generateTempPath();
    reporter = new JUnitReporter({ fd: fs.openSync(dest, 'w') });
    stream = reporter.stream;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
  });

  afterAll(() => fs.unlinkSync(dest));

  it('writes the output to fd', async () => {
    const j1 = tJourney('failed', 2);
    const s1 = tStep('failed', 1, new Error('Boom'));
    const s2 = tStep('skipped', 1, undefined, '', 's2');
    reporter.onJourneyStart(j1, { timestamp });

    reporter.onStepEnd(j1, s1, {});
    reporter.onStepEnd(j1, s2, {});
    reporter.onJourneyEnd(j1, {
      timestamp,
      browserDelay: 0,
      options: {},
    });
    reporter.onEnd();
    /**
     * Close the underyling stream writing to FD to read all its contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const buffer = fs.readFileSync(fs.openSync(dest, 'r'));
    expect(buffer.toString()).toMatchSnapshot();
  });

  it('writes the output to a file', async () => {
    const filepath = join(__dirname, '../../tmp', 'junit.xml');
    process.env.SYNTHETICS_JUNIT_FILE = filepath;
    const j1 = tJourney('failed', 2);
    const s1 = tStep('skipped', 1);
    reporter.onJourneyStart(j1, { timestamp });
    reporter.onStepEnd(j1, s1, {});
    reporter.onJourneyEnd(j1, {
      timestamp,
      browserDelay: 0,
      options: {},
    });
    await reporter.onEnd();
    stream.end();
    expect(fs.readFileSync(filepath, 'utf-8')).toMatchSnapshot();
    fs.unlinkSync(filepath);
    process.env.SYNTHETICS_JUNIT_FILE = '';
  });
});

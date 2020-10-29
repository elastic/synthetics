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
import { step, journey } from '../../src/core';
import JSONReporter from '../../src/reporters/json';
import * as helpers from '../../src/helpers';
import Runner from '../../src/core/runner';

/**
 * Mock package version to avoid breaking JSON payload
 * for every release
 */
jest.mock(
  '../../package.json',
  jest.fn(() => ({ version: '0.0.1' }))
);

describe('json reporter', () => {
  let dest: string;
  const j1 = journey('j1', async () => {});
  let stream;
  let runner: Runner;
  const timestamp = 1600300800000000;

  beforeEach(() => {
    runner = new Runner();
    dest = helpers.generateTempPath();
    stream = new JSONReporter(runner, { fd: fs.openSync(dest, 'w') }).stream;
    jest.spyOn(helpers, 'getTimestamp').mockImplementation(() => timestamp);
  });

  afterEach(() => {
    fs.unlinkSync(dest);
  });

  const readAndCloseStream = async () => {
    /**
     * Close the underyling stream writing to FD to read all the contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd, 'utf-8');
    return buffer;
  };

  const readAndCloseStreamJson = async () => {
    const buffer = await readAndCloseStream();
    const out = [];
    buffer.split('\n').forEach(l => {
      try {
        out.push(JSON.parse(l));
      } catch (e) {
        return; // ignore empty lines
      }
    });
    return out;
  };

  it('writes each step as NDJSON to the FD', async () => {
    runner.emit('journey:register', {
      journey: j1,
    });
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp,
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'succeeded',
      step: step('s1', async () => {}),
      screenshot: 'dummy',
      url: 'dummy',
      timestamp,
      start: 0,
      end: 10,
    });
    runner.emit('journey:end', {
      journey: j1,
      params: {},
      status: 'succeeded',
      start: 0,
      end: 11,
      timestamp,
      filmstrips: [
        {
          snapshot: 'dummy',
          name: 'screenshot',
          ts: 1,
        },
      ],
      networkinfo: [
        {
          request: {},
          response: {},
          isNavigationRequest: true,
        } as any,
      ],
    });
    runner.emit('end', 'done');

    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('writes step errors to the top level', async () => {
    const myErr = new Error('myError');

    runner.emit('step:end', {
      journey: j1,
      status: 'failed',
      step: step('s2', async () => {}),
      screenshot: 'dummy2',
      url: 'dummy2',
      timestamp: 1600300800000001,
      start: 11,
      end: 20,
      error: myErr,
    });

    const stepEnd = (await readAndCloseStreamJson()).find(
      json => json.type == 'step/end'
    );
    expect(stepEnd.error).toEqual(helpers.formatError(myErr));
  });

  it('writes journey errors to the top level', async () => {
    const myErr = new Error('myError');

    runner.emit('journey:end', {
      journey: j1,
      timestamp: 1600300800000001,
      start: 0,
      end: 1,
      params: {},
      status: 'failed',
      error: myErr,
    });

    const journeyEnd = (await readAndCloseStreamJson()).find(
      json => json.type == 'journey/end'
    );
    expect(journeyEnd.error).toEqual(helpers.formatError(myErr));
  });
});

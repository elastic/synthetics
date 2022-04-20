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

import fs, { mkdirSync } from 'fs';
import { join } from 'path';
import snakeCaseKeys from 'snakecase-keys';
import SonicBoom from 'sonic-boom';
import { step, journey } from '../../src/core';
import JSONReporter, {
  formatNetworkFields,
  gatherScreenshots,
  getScreenshotBlocks,
} from '../../src/reporters/json';
import * as helpers from '../../src/helpers';
import { NETWORK_INFO } from '../fixtures/networkinfo';
import { StatusValue } from '../../src/common_types';

/**
 * Mock package version to avoid breaking JSON payload
 * for every release
 */
jest.mock(
  '../../package.json',
  jest.fn(() => ({ version: '0.0.1', name: '@elastic/synthetics' }))
);

describe('json reporter', () => {
  let dest: string;
  const j1 = journey('j1', () => {});
  let stream: SonicBoom;
  let reporter: JSONReporter;
  const timestamp = 1600300800000000;
  const originalProcess = global.process;
  const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

  beforeAll(() => {
    // Mocking the process in node environment
    global.process = {
      ...originalProcess,
      platform: 'darwin',
    };
  });

  afterAll(() => {
    global.process = originalProcess;
  });

  beforeEach(() => {
    dest = helpers.generateTempPath();
    reporter = new JSONReporter({ fd: fs.openSync(dest, 'w') });
    stream = reporter.stream;
    jest.spyOn(helpers, 'getTimestamp').mockImplementation(() => timestamp);
  });

  afterEach(() => {
    fs.unlinkSync(dest);
  });

  const readAndCloseStream = async () => {
    /**
     * Close the underlying stream writing to FD to read all the contents
     */
    stream.once('drain', stream.end);
    await new Promise(resolve => stream.once('finish', resolve));
    return fs.readFileSync(fs.openSync(dest, 'r'), 'utf-8');
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
    const error = new Error('boom');
    error.stack = '';
    reporter.onJourneyRegister(j1);
    reporter.onJourneyStart(j1, {
      params: { environment: 'testing' },
      timestamp,
    });
    reporter.onStepEnd(j1, step('s1', helpers.noop), {
      status: 'succeeded',
      url: 'dummy',
      start: 0,
      end: 10,
      filmstrips: [
        {
          blob: 'dummy',
          mime: 'image/jpeg',
          start: {
            us: 392583998697,
          },
        },
      ],
      traces: [
        {
          name: 'navigationStart',
          type: 'mark',
          start: {
            us: 3065705158085,
          },
        },
        {
          name: 'firstContentfulPaint',
          type: 'mark',
          start: {
            us: 3065705560142,
          },
        },
        {
          name: 'layoutShift',
          type: 'mark',
          start: {
            us: 463045197179,
          },
          score: 0.19932291666666668,
        },
      ],
      metrics: {
        lcp: { us: 200 },
        fcp: { us: 100 },
        dcl: { us: 300 },
        load: { us: 400 },
        cls: 0.123,
      },
    });
    reporter.onJourneyEnd(j1, {
      timestamp,
      status: 'succeeded',
      start: 0,
      end: 11,
      options: {},
      networkinfo: [
        {
          request: {},
          response: undefined,
          isNavigationRequest: true,
          browser: {},
        } as any,
      ],
      browserconsole: [
        {
          timestamp,
          text: 'Boom',
          type: 'error',
          step: { name: 'step-name', index: 0 },
          error,
        },
      ],
    });
    reporter.onEnd();
    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('formats network fields in ECS format', async () => {
    for (const network of NETWORK_INFO) {
      const event = formatNetworkFields(network as any);
      const ecsKeys = Object.keys(event.ecs);
      const duplicates = Object.keys(event.payload).some(key =>
        ecsKeys.includes(key)
      );
      expect(duplicates).toBe(false);
      expect(snakeCaseKeys(event)).toMatchSnapshot();
    }
  });

  it('writes step errors to the top level', async () => {
    const myErr = new Error('myError');

    reporter.onStepEnd(j1, step('s2', helpers.noop), {
      status: 'failed',
      url: 'dummy2',
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

    reporter.onJourneyEnd(j1, {
      timestamp,
      start: 0,
      end: 1,
      status: 'failed',
      error: myErr,
      options: {},
    });

    const journeyEnd = (await readAndCloseStreamJson()).find(
      json => json.type == 'journey/end'
    );
    expect(journeyEnd.error).toEqual(helpers.formatError(myErr));
  });

  it('writes full journey info if present', async () => {
    const journeyOpts = { name: 'name', id: 'id', tags: ['tag1', 'tag2'] };

    reporter.onJourneyEnd(
      journey(journeyOpts, () => {}),
      {
        timestamp,
        start: 0,
        end: 1,
        status: 'skipped',
        options: {},
      }
    );

    const journeyEnd = (await readAndCloseStreamJson()).find(
      json => json.type == 'journey/end'
    );
    expect(journeyEnd.journey).toEqual({ ...journeyOpts, status: 'skipped' });
  });

  it('captures number of journeys as metadata event', async () => {
    reporter.onStart({ numJourneys: 10 });

    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('return empty when dir doesnt exists', async () => {
    const nonExistDir = join(FIXTURES_DIR, 'blah');
    const callback = jest.fn();
    await gatherScreenshots(nonExistDir, callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it('idempotent on constructing screenshots blocks', async () => {
    const screenshotsDir = join(FIXTURES_DIR, 'screenshots');
    const collectScreenshots = async () => {
      const screenshots = [];
      await gatherScreenshots(screenshotsDir, async ({ data }) => {
        const result = await getScreenshotBlocks(Buffer.from(data, 'base64'));
        screenshots.push(result);
      });
    };
    const screenshot1 = await collectScreenshots();
    const screenshot2 = await collectScreenshots();
    expect(screenshot1).toEqual(screenshot2);
  });

  describe('screenshots', () => {
    const sourceDir = join(FIXTURES_DIR, 'screenshots');
    const destDir = join(helpers.CACHE_PATH, 'screenshots');
    beforeAll(() => {
      mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(
        join(sourceDir, 'content.json'),
        join(destDir, 'content.json')
      );
    });

    afterAll(() => {
      fs.rmSync(destDir, { recursive: true, force: true });
    });

    const emitEnd = (options, status = 'failed' as StatusValue) =>
      reporter.onJourneyEnd(j1, {
        timestamp,
        start: 0,
        end: 2,
        status,
        options,
      });

    it('write whole blobs data ', async () => {
      emitEnd({
        screenshots: 'on',
        ssblocks: false,
      });
      const screenshotJson = (await readAndCloseStreamJson()).find(
        json => json.type == 'step/screenshot'
      );
      expect(screenshotJson).toMatchObject({
        step: {
          name: 'launch app',
          index: 1,
        },
        blob: expect.any(String),
        blob_mime: 'image/jpeg',
      });
    });

    it('write block & reference docs', async () => {
      emitEnd({
        screenshots: 'on',
        ssblocks: true,
      });
      expect((await readAndCloseStream()).toString()).toMatchSnapshot();
    });

    it('dont write on only-on-failure for successful journey', async () => {
      emitEnd(
        {
          screenshots: 'only-on-failure',
        },
        'succeeded'
      );
      const screenshotJson = (await readAndCloseStreamJson()).find(
        json => json.type == 'step/screenshot'
      );
      expect(screenshotJson).not.toBeDefined();
    });

    it('write on only-on-failure for failed journey', async () => {
      emitEnd({
        screenshots: 'only-on-failure',
      });
      const screenshotJson = (await readAndCloseStreamJson()).find(
        json => json.type == 'step/screenshot'
      );
      expect(screenshotJson).toMatchObject({
        step: {
          name: 'launch app',
          index: 1,
        },
        blob: expect.any(String),
        blob_mime: 'image/jpeg',
      });
    });
  });
});

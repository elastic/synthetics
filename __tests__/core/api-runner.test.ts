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
import { Gatherer } from '../../src/core/gatherer';
import Runner from '../../src/core/runner';
import { APIJourney } from '../../src/dsl';
import { generateTempPath, noop } from '../../src/helpers';
import { Reporter } from '../../src/reporters';
import {
  APIJourneyEndResult,
  JourneyEndResult,
  RunOptions,
} from '../../src/common_types';
import { Server } from '../utils/server';

describe('API runner', () => {
  let runner: Runner;
  let server: Server;
  let dest: string;
  let runOptions: RunOptions;
  let launchSpy: jest.SpyInstance;

  beforeAll(async () => {
    server = await Server.create();
    server.route('/ok', (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  afterAll(async () => await server.close());

  beforeEach(() => {
    runner = new Runner();
    dest = generateTempPath();
    runOptions = { outfd: fs.openSync(dest, 'w') };
    launchSpy = jest.spyOn(Gatherer, 'launchBrowser').mockResolvedValue();
  });
  afterEach(() => {
    launchSpy.mockRestore();
    try {
      fs.accessSync(dest);
      fs.unlinkSync(dest);
    } catch (_) {}
  });

  it('runs an API journey end-to-end without launching a browser', async () => {
    const j = new APIJourney('api-only', ({ request }) => {
      runner.currentJourney?._addStep('hit ok', async () => {
        const res = await request.get(`${server.PREFIX}/ok`);
        if (res.status() !== 200) throw new Error('bad status');
      });
    });
    runner._addJourney(j);

    const result = await runner._run(runOptions);
    expect(launchSpy).not.toHaveBeenCalled();
    expect(result['api-only'].status).toBe('succeeded');
    expect(result['api-only'].networkinfo).toEqual([
      expect.objectContaining({
        url: `${server.PREFIX}/ok`,
        request: expect.objectContaining({ method: 'GET' }),
        response: expect.objectContaining({ status: 200 }),
      }),
    ]);
  });

  it('omits browserDelay / browserconsole from API journey reporter payload', async () => {
    const j = new APIJourney('api-only', ({ request }) => {
      runner.currentJourney?._addStep('hit ok', async () => {
        await request.get(`${server.PREFIX}/ok`);
      });
    });
    runner._addJourney(j);

    const seen: Array<APIJourneyEndResult | JourneyEndResult> = [];
    class Capture implements Reporter {
      onJourneyEnd(_: any, result: APIJourneyEndResult | JourneyEndResult) {
        seen.push(result);
      }
    }
    await runner._run({ ...runOptions, reporter: Capture });
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toHaveProperty('browserDelay');
    expect(seen[0]).not.toHaveProperty('browserconsole');
    expect(seen[0].networkinfo).toBeDefined();
  });

  it('marks an API journey as failed when a step throws', async () => {
    const error = new Error('boom');
    const j = new APIJourney('api-fail', () => {
      runner.currentJourney?._addStep('throws', () => {
        throw error;
      });
    });
    runner._addJourney(j);

    const result = await runner._run(runOptions);
    expect(result['api-fail'].status).toBe('failed');
    expect(result['api-fail'].error).toBe(error);
  });

  it('does not launch the browser when registering an API journey alongside other API journeys', async () => {
    runner._addJourney(new APIJourney('a', noop));
    runner._addJourney(new APIJourney('b', noop));
    await runner._run(runOptions);
    expect(launchSpy).not.toHaveBeenCalled();
  });
});

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
import { APIJourney, Journey } from '../../src/dsl';
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

  it('handles steps that issue zero requests without breaking network grouping', async () => {
    const j = new APIJourney('api-mixed', ({ request }) => {
      runner.currentJourney?._addStep('empty step', async () => {
        // intentionally no requests — exercises the "step with no network
        // activity" case (e.g. assertion on local data, sleeps, etc.).
      });
      runner.currentJourney?._addStep('hit ok', async () => {
        const res = await request.get(`${server.PREFIX}/ok`);
        if (res.status() !== 200) throw new Error('bad status');
      });
    });
    runner._addJourney(j);

    const result = await runner._run(runOptions);
    expect(result['api-mixed'].status).toBe('succeeded');
    expect(result['api-mixed'].networkinfo).toHaveLength(1);
    /**
     * The single captured request must be attributed to the second step,
     * not the empty first one — `step` reference identity is the contract
     * `journey/network_info` events rely on for waterfall grouping.
     */
    const ni = result['api-mixed'].networkinfo;
    if (!ni || ni.length === 0)
      throw new Error('expected one network entry for api-mixed');
    expect(ni[0].step?.name).toBe('hit ok');
  });

  it('isolates cookies between API journeys (independent APIRequestContexts)', async () => {
    /**
     * Server sets a cookie on /set and echoes the inbound Cookie header
     * back on /echo so each journey can assert what *it* sent. If the two
     * journeys share an APIRequestContext, journey B would see the cookie
     * set during journey A.
     */
    server.route('/set-cookie', (_, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'session=abc; Path=/',
      });
      res.end('{}');
    });
    server.route('/echo-cookie', (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ cookie: req.headers.cookie ?? '' }));
    });

    const seenCookies: Record<string, string> = {};
    runner._addJourney(
      new APIJourney('first', ({ request }) => {
        runner.currentJourney?._addStep('set cookie', async () => {
          await request.get(`${server.PREFIX}/set-cookie`);
          const r = await request.get(`${server.PREFIX}/echo-cookie`);
          seenCookies.first = (await r.json()).cookie;
        });
      })
    );
    runner._addJourney(
      new APIJourney('second', ({ request }) => {
        runner.currentJourney?._addStep('echo cookie', async () => {
          const r = await request.get(`${server.PREFIX}/echo-cookie`);
          seenCookies.second = (await r.json()).cookie;
        });
      })
    );

    await runner._run(runOptions);
    expect(seenCookies.first).toContain('session=abc');
    // Second journey must NOT inherit the cookie from the first.
    expect(seenCookies.second).toBe('');
  });

  /**
   * Mixed suites are the default for users adopting `apiJourney` in an
   * existing browser-journey project. The runner must launch Chromium
   * exactly once (for the browser journey) and skip browser setup for
   * the API journey, while routing each through the right driver.
   */
  it('coexists with a browser journey: launches the browser only for browser journeys', async () => {
    const setupSpy = jest
      .spyOn(Gatherer, 'setupDriver')
      .mockImplementation(async (_opts, type) => {
        if (type === 'api') {
          return {
            request: {
              fetch: async () => ({}),
              dispose: async () => {},
            } as any,
          };
        }
        return {
          browser: {} as any,
          context: {
            on: jest.fn(),
            off: jest.fn(),
            pages: () => [],
            close: async () => {},
          } as any,
          page: {} as any,
          client: {} as any,
          request: {
            fetch: async () => ({}),
            dispose: async () => {},
          } as any,
        };
      });
    try {
      runner._addJourney(new Journey({ name: 'browser-j' }, () => {}));
      runner._addJourney(new APIJourney('api-j', () => {}));

      await runner._run(runOptions);
      expect(launchSpy).toHaveBeenCalledTimes(1);
      const types = setupSpy.mock.calls.map(([, type]) => type);
      expect(types).toEqual(['browser', 'api']);
    } finally {
      setupSpy.mockRestore();
    }
  });

  describe('with HTTPS endpoint', () => {
    let httpsServer: Server;
    beforeAll(async () => {
      httpsServer = await Server.create({ tls: true });
      httpsServer.route('/secure', (_, res) => {
        const body = '{"ok":"true"}';
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        });
        res.end(body);
      });
    });
    afterAll(async () => await httpsServer.close());

    it('captures TLS certificate info, remote address, and body bytes for HTTPS calls', async () => {
      const j = new APIJourney('api-https', ({ request }) => {
        runner.currentJourney?._addStep('hit secure', async () => {
          const res = await request.get(`${httpsServer.PREFIX}/secure`);
          if (res.status() !== 200) throw new Error('bad status');
        });
      });
      runner._addJourney(j);

      const result = await runner._run({
        ...runOptions,
        playwrightOptions: { ignoreHTTPSErrors: true },
      });
      expect(result['api-https'].status).toBe('succeeded');
      const ni = result['api-https'].networkinfo;
      if (!ni || ni.length === 0)
        throw new Error('expected one network entry for api-https');
      const entry = ni[0];
      expect(entry.response.securityDetails).toMatchObject({
        protocol: expect.stringMatching(/^TLS /),
        validFrom: expect.any(Number),
        validTo: expect.any(Number),
      });
      expect(entry.response.remoteIPAddress).toBeDefined();
      expect(entry.response.remotePort).toBeDefined();
      const bodyBytes = entry.response.body?.bytes ?? 0;
      expect(bodyBytes).toBeGreaterThan(0);
      expect(entry.transferSize).toBeGreaterThanOrEqual(bodyBytes);
    });
  });
});

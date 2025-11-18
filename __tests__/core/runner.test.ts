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
import { step, journey, before, after } from '../../src/core';
import { Journey, Step } from '../../src/dsl';
import { Server } from '../utils/server';
import {
  DEFAULT_THROTTLING_OPTIONS,
  generateTempPath,
  noop,
} from '../../src/helpers';
import { wsEndpoint } from '../utils/test-config';
import { Reporter } from '../../src/reporters';
import {
  JourneyEndResult,
  JourneyStartResult,
  RunOptions,
  StartEvent,
} from '../../src/common_types';

describe('runner', () => {
  let runner: Runner,
    server: Server,
    dest: string,
    defaultRunOptions: RunOptions = {};

  beforeAll(async () => (server = await Server.create()));
  beforeEach(async () => {
    runner = new Runner();
    dest = generateTempPath();
    defaultRunOptions = {
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
    };
  });
  afterEach(() => {
    try {
      fs.accessSync(dest);
      fs.unlinkSync(dest);
    } catch (_) {}
  });
  afterAll(async () => await server.close());

  it('add journeys', () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    runner._addJourney(j1);
    runner._addJourney(j2);
    expect(runner.journeys.length).toBe(2);
  });

  it('add hooks', async () => {
    runner._addHook('beforeAll', noop);
    runner._addHook('afterAll', noop);
    expect(runner.hooks.beforeAll).toEqual([noop]);
    expect(runner.hooks.afterAll).toEqual([noop]);
  });

  it('run journey - report results payload', async () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const s1 = j1._addStep('step1', noop);
    runner._addJourney(j1);
    class ResultReporter implements Reporter {
      onJourneyStart(journey: Journey, result: JourneyStartResult) {
        expect(j1).toEqual(journey);
        expect(result).toMatchObject({
          timestamp: expect.any(Number),
        });
      }
      onStepStart(journey: Journey, step: Step) {
        expect(j1).toEqual(journey);
        expect(s1).toEqual(step);
      }
      onStepEnd(journey: Journey, step: Step) {
        expect(j1).toEqual(journey);
        expect(s1).toEqual(step);
      }
      onJourneyEnd(journey: Journey, result: JourneyEndResult) {
        expect(journey.status).toEqual('succeeded');
        expect(result).toMatchObject({
          timestamp: expect.any(Number),
          browserDelay: expect.any(Number),
        });
      }
    }
    const opts = { ...defaultRunOptions, reporter: ResultReporter };

    const result = await runner._run(opts);
    expect(result[j1.name].status).toBe('succeeded');
  });

  it('run journey - failed when any step fails', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey._addStep('step1', noop);
    const error = new Error('Broken step 2');
    journey._addStep('step2', () => {
      throw error;
    });
    const result = await runner._runJourney(journey, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toMatchObject({
      error: error,
      status: 'failed',
      steps: [
        {
          status: 'succeeded',
        },
        {
          error: error,
          status: 'failed',
        },
      ],
    });
  });

  it('run journey - with hooks', async () => {
    const journey = new Journey({ name: 'with hooks' }, noop);
    journey._addHook('before', noop);
    journey._addHook('after', noop);

    const result = await runner._runJourney(journey, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toMatchObject({
      status: 'succeeded',
    });
  });

  it('run journey - failed when hooks errors', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey._addHook('before', noop);
    const error = new Error('Broken after hook');
    journey._addHook('after', () => {
      throw error;
    });
    const result = await runner._runJourney(journey, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toMatchObject({
      status: 'failed',
      error,
    });
  });

  it('run journey - failed on beforeAll', async () => {
    const error = new Error('Broken beforeAll hook');
    runner._addHook('beforeAll', () => {
      throw error;
    });
    runner._addJourney(new Journey({ name: 'j1' }, () => step('step1', noop)));
    runner._addJourney(new Journey({ name: 'j2' }, () => step('step1', noop)));
    const result = await runner._run(defaultRunOptions);
    expect(result).toMatchObject({
      j1: { status: 'failed', error },
      j2: { status: 'failed', error },
    });
  });

  it('run journey - expose info in hooks', async () => {
    const error = new Error('Broken step');
    const j1 = journey('fail-journey-with-hooks', () => {
      before(({ info }) => {
        expect(info.currentJourney?.status).toBe('pending');
      });
      after(({ info }) => {
        expect(info.currentJourney?.status).toBe('failed');
        expect(info.currentJourney?.error).toBe(error);
        expect(info.currentJourney?.duration).toBeGreaterThan(0);
      });
      step('step1', () => {
        throw error;
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toMatchObject({
      status: 'failed',
      error,
    });
  });

  it('run journey - expose info in journey', async () => {
    const j1 = journey('with info', ({ info }) => {
      step('step1', () => {
        expect(info.currentJourney?.status).toBe('pending');
      });
      after(({ info }) => {
        expect(info.currentJourney?.status).toBe('succeeded');
        expect(info.currentJourney?.duration).toBeGreaterThan(0);
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toMatchObject({
      status: 'succeeded',
    });
  });

  it('run step', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    const runOptions = { ...defaultRunOptions, metrics: true };
    const result = await runner._runJourney(j1, runOptions);
    await Gatherer.stop();
    expect(result.stepsresults?.[0].pagemetrics).toBeDefined();
    expect(result.steps).toMatchObject([
      {
        duration: expect.any(Number),
        status: 'succeeded',
        url: server.TEST_PAGE,
      },
    ]);
  });

  it('run step - syntax failure', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await (page as any).clickkkkkk();
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result.steps).toMatchObject([
      {
        status: 'failed',
        url: 'about:blank',
        error: expect.any(Error),
      },
    ]);
  });

  it('run step - navigation failure', async () => {
    const url = 'http://blah/';
    const j1 = journey('j1', async ({ page }) => {
      step('cannot resoslve url', async () => {
        await page.goto(url);
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result.steps).toMatchObject([
      {
        status: 'failed',
        url,
        error: expect.any(Error),
      },
    ]);
  });

  it('run step - bad navigation', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('bad url', async () => {
        await page.goto('blah');
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result.steps).toMatchObject([
      {
        status: 'failed',
        url: 'about:blank',
        error: expect.any(Error),
      },
    ]);
  });

  it('run steps - new window navigation', async () => {
    const j1 = journey('j1', async ({ page, context }) => {
      step('visit test page', async () => {
        await page.goto(server.TEST_PAGE);
        await page.setContent(
          '<a target=_blank rel=noopener href="/popup.html">popup</a>'
        );
      });
      step('click popup', async () => {
        const [page1] = await Promise.all([
          context.waitForEvent('page'),
          page.click('a'),
        ]);
        await page1.waitForLoadState();
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result.steps).toMatchObject([
      {
        status: 'succeeded',
        url: server.TEST_PAGE,
      },
      {
        status: 'succeeded',
        url: server.PREFIX + '/popup.html',
      },
    ]);
  });

  it('run steps - accumulate results', async () => {
    const error = new Error('broken step 2');
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
      step('step2', () => {
        throw error;
      });
    });
    const result = await runner._runJourney(j1, defaultRunOptions);
    await Gatherer.stop();
    expect(result.steps).toMatchObject([
      {
        status: 'succeeded',
        url: server.TEST_PAGE,
      },
      {
        status: 'failed',
        url: server.TEST_PAGE,
        error,
      },
    ]);
  });

  it('run api', async () => {
    const name = 'test-journey';
    const journey = new Journey({ name }, noop);
    runner._addJourney(journey);
    const result = await runner._run(defaultRunOptions);
    expect(result).toMatchObject({
      [name]: { status: 'succeeded' },
    });
  });

  it('run api - match journey name explicit', async () => {
    runner._addJourney(new Journey({ name: 'j1' }, noop));
    runner._addJourney(new Journey({ name: 'j2' }, noop));
    expect(
      await runner._run({
        ...defaultRunOptions,
        grepOpts: { match: 'j2' },
      })
    ).toMatchObject({
      j2: { status: 'succeeded' },
    });
  });

  it('run api - match journey name and tag globs', async () => {
    runner._addJourney(new Journey({ name: 'j1' }, noop));
    runner._addJourney(new Journey({ name: 'tagj2', tags: ['j2'] }, noop));
    expect(
      await runner._run({
        ...defaultRunOptions,
        grepOpts: { match: 'j*' },
      })
    ).toMatchObject({
      j1: { status: 'succeeded' },
      tagj2: { status: 'succeeded' },
    });
  });

  it('run api - prefer tags glob matching', async () => {
    runner._addJourney(new Journey({ name: 'j1', tags: ['foo'] }, noop));
    runner._addJourney(new Journey({ name: 'j2', tags: ['bar'] }, noop));
    runner._addJourney(new Journey({ name: 'j3', tags: ['foo:test'] }, noop));
    runner._addJourney(new Journey({ name: 'j4', tags: ['baz'] }, noop));
    runner._addJourney(new Journey({ name: 'j5', tags: ['foo'] }, noop));
    expect(
      await runner._run({
        ...defaultRunOptions,
        grepOpts: { tags: ['foo*'], match: 'j*' },
      })
    ).toMatchObject({
      j1: { status: 'succeeded' },
      j3: { status: 'succeeded' },
      j5: { status: 'succeeded' },
    });
  });

  it('run api - support multiple tags', async () => {
    runner._addJourney(new Journey({ name: 'j1', tags: ['hello:foo'] }, noop));
    runner._addJourney(new Journey({ name: 'j2', tags: ['hello:bar'] }, noop));
    runner._addJourney(new Journey({ name: 'j3', tags: ['hello:baz'] }, noop));
    expect(
      await runner._run({
        ...defaultRunOptions,
        grepOpts: { tags: ['hello:b*'] },
      })
    ).toMatchObject({
      j2: { status: 'succeeded' },
      j3: { status: 'succeeded' },
    });
  });

  it('run api - support negation tags', async () => {
    runner._addJourney(new Journey({ name: 'j1', tags: ['hello:foo'] }, noop));
    runner._addJourney(new Journey({ name: 'j2', tags: ['hello:bar'] }, noop));
    runner._addJourney(new Journey({ name: 'j3', tags: ['hello:baz'] }, noop));
    expect(
      await runner._run({
        ...defaultRunOptions,
        grepOpts: { tags: ['!hello:b*'] },
      })
    ).toMatchObject({
      j1: { status: 'succeeded' },
    });
  });

  it('run api - accumulate failed journeys', async () => {
    runner._addJourney(new Journey({ name: 'j1' }, noop));
    const j2 = new Journey({ name: 'j2' }, noop);
    const error = new Error('broken journey');
    j2._addStep('step1', async () => {
      throw error;
    });
    runner._addJourney(j2);
    const result = await runner._run(defaultRunOptions);
    expect(result).toMatchObject({
      j1: { status: 'succeeded' },
      j2: { status: 'failed', error },
    });
  });

  it('run api - dry run', async () => {
    runner._addJourney(new Journey({ name: 'j1' }, noop));
    runner._addJourney(new Journey({ name: 'j2' }, noop));
    let count = 0;
    class DryRunReporter implements Reporter {
      onJourneyRegister() {
        count++;
      }
    }
    const result = await runner._run({
      ...defaultRunOptions,
      reporter: DryRunReporter,
      dryRun: true,
    });
    expect(result).toEqual({});
    expect(count).toBe(2);
  });

  it('run - should preserve order hooks/journeys/steps', async () => {
    const result: Array<string> = [];
    runner._addHook('beforeAll', async () => result.push('beforeAll1'));
    runner._addHook('afterAll', async () => result.push('afterAll1'));
    const j1 = new Journey({ name: 'j1' }, noop);
    j1._addHook('before', () => result.push('before1'));
    j1._addHook('after', () => result.push('after1'));
    j1._addStep('s1', () => result.push('step1'));
    const j2 = new Journey({ name: 'j1' }, noop);
    runner._addHook('beforeAll', () => result.push('beforeAll2'));
    runner._addHook('afterAll', () => result.push('afterAll2'));
    j2._addHook('before', () => result.push('before2'));
    j2._addHook('after', () => result.push('after2'));
    j2._addStep('s2', () => result.push('step2'));
    runner._addJourney(j1);
    runner._addJourney(j2);

    await runner._run(defaultRunOptions);
    expect(result).toEqual([
      'beforeAll1',
      'beforeAll2',
      'before1',
      'step1',
      'after1',
      'before2',
      'step2',
      'after2',
      'afterAll1',
      'afterAll2',
    ]);
  });

  it('run - expose params in all hooks', async () => {
    const result: Array<Record<string, any>> = [];
    runner._addHook('beforeAll', ({ params, env }) =>
      result.push({ name: 'beforeAll', params, env })
    );
    runner._addHook('afterAll', ({ params }) =>
      result.push({ name: 'afterAll', params })
    );
    const j1 = new Journey({ name: 'j1' }, noop);
    j1._addHook('before', ({ params }) => {
      result.push({ name: 'before', params });
    });
    j1._addHook('after', ({ params, env }) => {
      result.push({ name: 'after', params, env });
    });
    j1._addStep('s1', () => result.push({ name: 'step1' }));
    runner._addJourney(j1);

    const params = {
      url: 'http://local.dev',
    };
    await runner._run({
      ...defaultRunOptions,
      params,
      environment: 'testing',
    });

    expect(result).toEqual([
      { name: 'beforeAll', params, env: 'testing' },
      { name: 'before', params },
      { name: 'step1' },
      { name: 'after', params, env: 'testing' },
      { name: 'afterAll', params },
    ]);
  });

  it('run - supports custom reporters', async () => {
    let reporter;
    class CustomReporter implements Reporter {
      messages: string[] = [];
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        reporter = this;
      }
      onStart({ numJourneys }: StartEvent) {
        this.messages.push(`numJourneys ${numJourneys}`);
      }
      onJourneyStart(journey: Journey) {
        this.messages.push(`journey:start ${journey.name}`);
      }
      onJourneyEnd(journey: Journey) {
        this.messages.push(`journey:end ${journey.name}`);
      }
      onEnd() {
        this.messages.push(`end`);
      }
    }

    runner._addJourney(new Journey({ name: 'foo' }, noop));
    const result = await runner._run({
      ...defaultRunOptions,
      reporter: CustomReporter,
    });
    expect(result).toMatchObject({
      foo: {
        status: 'succeeded',
      },
    });
    expect(reporter?.messages).toEqual([
      'numJourneys 1',
      'journey:start foo',
      'journey:end foo',
      'end',
    ]);
  });

  const readAndCloseStreamJson = () => {
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd, 'utf-8');
    const out: Array<any> = [];
    buffer.split('\n').forEach(l => {
      try {
        out.push(JSON.parse(l));
      } catch (e) {
        return; // ignore empty lines
      }
    });
    return out;
  };

  it('run api - verify screenshots', async () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const s1 = j1._addStep('j1s1', noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    const s2 = j2._addStep('j2s2', noop);
    runner._addJourney(j1);
    runner._addJourney(j2);

    await runner._run({
      ...defaultRunOptions,
      reporter: 'json',
      screenshots: 'on',
    });

    const screenshotJson = readAndCloseStreamJson().filter(
      ({ type }) => type === 'step/screenshot'
    );
    expect(screenshotJson.length).toEqual(2);
    expect(screenshotJson).toMatchObject([
      {
        journey: { name: j1.name },
        step: { name: s1.name, index: 1 },
      },
      {
        journey: { name: j2.name },
        step: { name: s2.name, index: 1 },
      },
    ]);
  });

  it('run - differentiate screenshots for popups', async () => {
    const j1 = journey('j1', async ({ page, context }) => {
      step('visit test page', async () => {
        await page.goto(server.TEST_PAGE);
        await page.setContent(
          '<a target=_blank rel=noopener href="/popup.html">popup</a>'
        );
      });
      step('click popup', async () => {
        const [page1] = await Promise.all([
          context.waitForEvent('page'),
          page.click('a'),
        ]);
        await page1.waitForLoadState();
      });
    });
    runner._addJourney(j1);

    await runner._run({
      ...defaultRunOptions,
      reporter: 'json',
      screenshots: 'on',
    });

    const screenshotDocs = readAndCloseStreamJson().filter(
      ({ type }) => type === 'step/screenshot'
    );
    expect(screenshotDocs.length).toEqual(2);
    const blobs = screenshotDocs.map(data => data.blob);
    expect(blobs[0]).not.toEqual(blobs[1]);
  });

  it('run - capture trace step level', async () => {
    const j1 = journey('test trace', async ({ page }) => {
      step('without FCP', async () => {
        await page.goto('about:blank');
      });
      step('with FCP', async () => {
        await page.goto(server.TEST_PAGE);
        // Image paint triggers FCP and LCP
        await page.setContent(`
          <img src=${server.PREFIX}/favicon.png>
        `);
        await page.waitForLoadState('networkidle');
        throw 'step error';
      });
    });
    runner._addJourney(j1);
    const runOptions = { ...defaultRunOptions, trace: true };
    const results = await runner._run(runOptions);
    const steps = results[j1.name].stepsresults;
    expect(steps?.length).toBe(2);
    expect(steps?.[0].metrics).toBeUndefined();
    expect(steps?.[0].traces).toBeUndefined();
    expect(steps?.[1].traces?.length).toBeGreaterThan(0);
    expect(steps?.[1].metrics).toMatchObject({
      cls: 0,
      fcp: { us: expect.any(Number) },
      load: { us: expect.any(Number) },
    });
  });

  it('run - use step timeouts', async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    server.route('/delay500', async (req, res) => {
      await delay(500);
      res.end('delay 500');
    });
    const j1 = journey('timeout', async ({ page }) => {
      step('delayed step', async () => {
        // keep 200ms timeout for navigation
        await page.goto(server.PREFIX + '/delay500', { timeout: 200 });
      });
    });
    await runner._addJourney(j1);

    class StepCheckReporter implements Reporter {
      onStepEnd(j, s: Step) {
        const durationMs = s.duration * 1000;
        // Should not wait till the page is loaded which is after 500ms delay
        // ideally should be in the ~200ms range
        expect(durationMs).not.toBeGreaterThan(500);
      }
    }
    const result = await runner._run({
      ...defaultRunOptions,
      screenshots: 'off',
      reporter: StepCheckReporter,
    });
    expect(result[j1.name].error?.message).toContain('Timeout 200ms exceeded');
  });

  it('run - timestamps must be in order', async () => {
    const j1 = journey('journey1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    runner._addJourney(j1);
    await runner._run({
      ...defaultRunOptions,
      reporter: 'json',
      screenshots: 'on',
      network: true,
    });

    const events = readAndCloseStreamJson().map(event => ({
      type: event.type,
      timestamp: event['@timestamp'],
    }));
    // sort the events as written order might be different
    events.sort((a, b) => a.timestamp - b.timestamp);
    const realEventsOrder = [
      'synthetics/metadata',
      'journey/start',
      'journey/network_info',
      'step/screenshot',
      'step/end',
      'journey/end',
    ];
    const collectOrder = events.map(event => event.type);
    expect(collectOrder).toEqual(realEventsOrder);
  });

  describe('build monitors', () => {
    const options = { auth: 'foo', throttling: DEFAULT_THROTTLING_OPTIONS };
    it('runner - build monitors with local config', async () => {
      const j1 = new Journey({ name: 'j1', tags: ['j1', 'j2'] }, noop);
      const j2 = new Journey({ name: 'j2' }, noop);
      j1._updateMonitor({
        id: 'test-j1',
        schedule: 3,
        tags: ['l1', 'l2'],
        locations: ['united_kingdom'],
      });
      j2._updateMonitor({
        throttling: { latency: 1000 },
        schedule: 1,
        alert: { status: { enabled: false } },
      });
      runner._addJourney(j1);
      runner._addJourney(j2);

      const monitors = runner._buildMonitors(options);
      expect(monitors.length).toBe(2);
      expect(monitors[0].config).toEqual({
        id: 'test-j1',
        name: 'j1',
        type: 'browser',
        tags: ['l1', 'l2'],
        locations: ['united_kingdom'],
        schedule: 3,
        throttling: { download: 5, latency: 20, upload: 3 },
        spaces: [],
      });
      expect(monitors[1].config).toMatchObject({
        throttling: { latency: 1000 },
        schedule: 1,
        alert: { status: { enabled: false } },
        tags: [],
      });
    });

    it('runner - build monitors with global config', async () => {
      // Faking monitor.use across file level
      runner._updateMonitor({
        schedule: 5,
        locations: ['us_east'],
        privateLocations: ['germany'],
        throttling: { download: 100, upload: 50 },
        params: { env: 'test' },
        tags: ['g1', 'g2'],
        alert: { tls: { enabled: true } },
        playwrightOptions: { ignoreHTTPSErrors: true },
        fields: { area: 'website' },
        namespace: 'test',
      });

      const j1 = new Journey({ name: 'j1', tags: ['foo*'] }, noop);
      const j2 = new Journey({ name: 'j2' }, noop);
      j1._updateMonitor({
        id: 'test-j1',
        schedule: 3,
        locations: ['united_kingdom'],
        privateLocations: ['spain'],
        retestOnFailure: true,
        maintenanceWindows: ['daily', 'weekly'],
      });
      j2._updateMonitor({ throttling: { latency: 1000 }, enabled: true });
      runner._addJourney(j1);
      runner._addJourney(j2);

      const monitors = runner._buildMonitors({
        ...options,
        enabled: false,
        retestOnFailure: false,
        maintenanceWindows: ['daily', 'weekly'],
      });
      expect(monitors.length).toBe(2);
      expect(monitors[0].config).toEqual({
        id: 'test-j1',
        name: 'j1',
        enabled: false,
        type: 'browser',
        tags: ['foo*'],
        locations: ['united_kingdom'],
        privateLocations: ['spain'],
        schedule: 3,
        params: { env: 'test' },
        playwrightOptions: { ignoreHTTPSErrors: true },
        throttling: { download: 100, latency: 20, upload: 50 },
        alert: { tls: { enabled: true } },
        retestOnFailure: true,
        fields: { area: 'website' },
        spaces: [],
        namespace: 'test',
        maintenanceWindows: ['daily', 'weekly'],
      });
      expect(monitors[1].config).toMatchObject({
        locations: ['us_east'],
        privateLocations: ['germany'],
        schedule: 5,
        enabled: true,
        tags: ['g1', 'g2'],
        throttling: { latency: 1000 },
        alert: { tls: { enabled: true } },
      });
    });

    it('runner - build monitors filtered via "match"', async () => {
      const j1 = new Journey({ name: 'j1' }, noop);
      const j2 = new Journey({ name: 'j2' }, noop);
      runner._addJourney(j1);
      runner._addJourney(j2);

      const monitors = runner._buildMonitors({
        ...options,
        grepOpts: { match: 'j1' },
        schedule: 1,
      });
      expect(monitors.length).toBe(1);
      expect(monitors[0].config.name).toBe('j1');
    });

    it('runner - build monitors with  via "tags"', async () => {
      const j1 = new Journey({ name: 'j1', tags: ['first'] }, noop);
      const j2 = new Journey({ name: 'j2', tags: ['second'] }, noop);
      const j3 = new Journey({ name: 'j3' }, noop);
      runner._addJourney(j1);
      runner._addJourney(j2);
      runner._addJourney(j3);

      const monitors = runner._buildMonitors({
        ...options,
        grepOpts: { tags: ['first'] },
        schedule: 1,
      });
      expect(monitors.length).toBe(1);
      expect(monitors[0].config.name).toBe('j1');
    });

    it('runner - build monitors with config and filter  via "tags"', async () => {
      const j1 = new Journey({ name: 'j1', tags: ['first'] }, noop);
      const j2 = new Journey({ name: 'j2', tags: ['second'] }, noop);
      const j3 = new Journey({ name: 'j3' }, noop);
      runner._addJourney(j1);
      runner._addJourney(j2);
      runner._addJourney(j3);
      // using monitor.use
      j2._updateMonitor({ tags: ['newtag'] });

      const monitors = runner._buildMonitors({
        ...options,
        tags: ['newtag'],
        grepOpts: { tags: ['newtag'] },
        schedule: 1,
      });
      expect(monitors.length).toBe(2);
      expect(monitors.map(m => m.config.name)).toEqual(['j2', 'j3']);
    });
  });

  describe('journey and step annotations', () => {
    it('skip journey', async () => {
      runner._addJourney(journey.skip('j1', noop));
      runner._addJourney(journey('j2', noop));
      const result = await runner._run(defaultRunOptions);
      expect(result).toMatchObject({
        j2: {
          status: 'succeeded',
          steps: [],
        },
      });
    });

    it('only journey', async () => {
      runner._addJourney(journey.only('j1', noop));
      runner._addJourney(journey('j2', noop));
      const result = await runner._run(defaultRunOptions);
      expect(result).toMatchObject({
        j1: {
          status: 'succeeded',
          steps: [],
        },
      });
    });

    it('skip step', async () => {
      runner._addJourney(
        journey('j1', async () => {
          step('step1', noop);
          step.skip('step2', noop);
        })
      );
      const result = await runner._run(defaultRunOptions);
      expect(result).toMatchObject({
        j1: {
          status: 'succeeded',
          steps: [
            {
              status: 'succeeded',
            },
            {
              status: 'skipped',
            },
          ],
        },
      });
    });
    it('soft step failure', async () => {
      runner._addJourney(
        journey('j1', async () => {
          step('step1', noop);
          step.soft('step2', async () => {
            throw new Error('step2 soft error');
          });
          step.soft('step3', noop);
        })
      );
      const result = await runner._run(defaultRunOptions);

      expect(result).toMatchObject({
        j1: {
          error: new Error('step2 soft error'),
          status: 'failed',
          steps: [
            {
              status: 'succeeded',
            },
            {
              error: new Error('step2 soft error'),
              status: 'failed',
            },
            {
              status: 'succeeded',
            },
          ],
        },
      });
    });

    it('only step', async () => {
      runner._addJourney(
        journey('j1', async () => {
          step('step1', noop);
          step.only('step2', async () => {
            throw new Error('step2 only error');
          });
          step.only('step3', async () => {
            throw new Error('step3 only error');
          });
          step('step3', noop);
        })
      );
      const result = await runner._run(defaultRunOptions);

      expect(result).toMatchObject({
        j1: {
          error: new Error('step3 only error'),
          status: 'failed',
          steps: [
            {
              status: 'skipped',
            },
            {
              error: new Error('step2 only error'),
              status: 'failed',
            },
            {
              error: new Error('step3 only error'),
              status: 'failed',
            },
            {
              status: 'skipped',
            },
          ],
        },
      });
    });
  });
});

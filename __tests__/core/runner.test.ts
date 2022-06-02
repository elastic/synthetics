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
import { step, journey } from '../../src/core';
import { Journey, Step } from '../../src/dsl';
import { Server } from '../utils/server';
import { generateTempPath, noop } from '../../src/helpers';
import { wsEndpoint } from '../utils/test-config';
import { Reporter } from '../../src/reporters';
import { getDefaultMonitorConfig } from '../../src/options';
import {
  JourneyEndResult,
  JourneyStartResult,
  RunOptions,
  StartEvent,
  StepEndResult,
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
    runner.addJourney(j1);
    runner.addJourney(j2);
    expect(runner.journeys.length).toBe(2);
  });

  it('add hooks', async () => {
    runner.addHook('beforeAll', noop);
    runner.addHook('afterAll', noop);
    expect(runner.hooks.beforeAll).toEqual([noop]);
    expect(runner.hooks.afterAll).toEqual([noop]);
  });

  it('run journey - report results payload', async () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const s1 = j1.addStep('step1', noop);
    runner.addJourney(j1);
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
      onStepEnd(journey: Journey, step: Step, result: StepEndResult) {
        expect(j1).toEqual(journey);
        expect(s1).toEqual(step);
        expect(result).toMatchObject({
          status: 'succeeded',
          url: 'about:blank',
          start: expect.any(Number),
          end: expect.any(Number),
        });
      }
      onJourneyEnd(journey: Journey, result: JourneyEndResult) {
        expect(j1).toEqual(journey);
        expect(result).toMatchObject({
          status: 'succeeded',
          start: expect.any(Number),
          end: expect.any(Number),
        });
      }
    }
    const opts = { ...defaultRunOptions, reporter: ResultReporter };

    const result = await runner.run(opts);
    expect(result[j1.name].status).toBe('succeeded');
  });

  it('run journey - failed when any step fails', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey.addStep('step1', noop);
    const error = new Error('Broken step 2');
    journey.addStep('step2', () => {
      throw error;
    });
    const result = await runner.runJourney(journey, defaultRunOptions);
    expect(result).toEqual({
      status: 'failed',
      error,
    });
  });

  it('run journey - with hooks', async () => {
    const journey = new Journey({ name: 'with hooks' }, noop);
    journey.addHook('before', noop);
    journey.addHook('after', noop);
    const result = await runner.runJourney(journey, defaultRunOptions);
    expect(result).toEqual({
      status: 'succeeded',
    });
  });

  it('run journey - failed when hooks errors', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey.addHook('before', noop);
    const error = new Error('Broken after hook');
    journey.addHook('after', () => {
      throw error;
    });
    const result = await runner.runJourney(journey, defaultRunOptions);
    expect(result).toEqual({
      status: 'failed',
      error,
    });
  });

  it('run journey - failed on beforeAll', async () => {
    const error = new Error('Broken beforeAll hook');
    runner.addHook('beforeAll', () => {
      throw error;
    });
    runner.addJourney(new Journey({ name: 'j1' }, () => step('step1', noop)));
    runner.addJourney(new Journey({ name: 'j2' }, () => step('step1', noop)));
    const result = await runner.run(defaultRunOptions);
    expect(result).toEqual({
      j1: { status: 'failed', error },
      j2: { status: 'failed', error },
    });
  });

  it('run step', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    const runOptions = { ...defaultRunOptions, metrics: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, runOptions);
    await Gatherer.stop();
    expect(result).toEqual([
      {
        status: 'succeeded',
        pagemetrics: expect.any(Object),
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
    const context = await Runner.createContext(defaultRunOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toEqual([
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
    const context = await Runner.createContext(defaultRunOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toEqual([
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
    const context = await Runner.createContext(defaultRunOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toEqual([
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
    const context = await Runner.createContext(defaultRunOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, defaultRunOptions);
    await Gatherer.stop();
    expect(result).toEqual([
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
    const context = await Runner.createContext(defaultRunOptions);
    await runner.registerJourney(j1, context);
    const [step1, step2] = await runner.runSteps(
      j1,
      context,
      defaultRunOptions
    );
    await Gatherer.stop();
    expect(step1).toEqual({
      status: 'succeeded',
      url: server.TEST_PAGE,
    });
    expect(step2).toEqual({
      status: 'failed',
      url: server.TEST_PAGE,
      error,
    });
  });

  it('run api', async () => {
    const name = 'test-journey';
    const journey = new Journey({ name }, noop);
    runner.addJourney(journey);
    const result = await runner.run(defaultRunOptions);
    expect(result).toEqual({
      [name]: { status: 'succeeded' },
    });
  });

  it('run api - match journey name explicit', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'j2' }, noop));
    expect(
      await runner.run({
        ...defaultRunOptions,
        match: 'j2',
      })
    ).toEqual({
      j2: { status: 'succeeded' },
    });
  });

  it('run api - match journey name and tag globs', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'tagj2', tags: ['j2'] }, noop));
    expect(
      await runner.run({
        ...defaultRunOptions,
        match: 'j*',
      })
    ).toEqual({
      j1: { status: 'succeeded' },
      tagj2: { status: 'succeeded' },
    });
  });

  it('run api - prefer tags glob matching', async () => {
    runner.addJourney(new Journey({ name: 'j1', tags: ['foo'] }, noop));
    runner.addJourney(new Journey({ name: 'j2', tags: ['bar'] }, noop));
    runner.addJourney(new Journey({ name: 'j3', tags: ['foo:test'] }, noop));
    runner.addJourney(new Journey({ name: 'j4', tags: ['baz'] }, noop));
    runner.addJourney(new Journey({ name: 'j5', tags: ['foo'] }, noop));
    expect(
      await runner.run({
        ...defaultRunOptions,
        tags: ['foo*'],
        match: 'j*',
      })
    ).toEqual({
      j1: { status: 'succeeded' },
      j3: { status: 'succeeded' },
      j5: { status: 'succeeded' },
    });
  });

  it('run api - support multiple tags', async () => {
    runner.addJourney(new Journey({ name: 'j1', tags: ['hello:foo'] }, noop));
    runner.addJourney(new Journey({ name: 'j2', tags: ['hello:bar'] }, noop));
    runner.addJourney(new Journey({ name: 'j3', tags: ['hello:baz'] }, noop));
    expect(
      await runner.run({
        ...defaultRunOptions,
        tags: ['hello:b*'],
      })
    ).toEqual({
      j2: { status: 'succeeded' },
      j3: { status: 'succeeded' },
    });
  });

  it('run api - support negation tags', async () => {
    runner.addJourney(new Journey({ name: 'j1', tags: ['hello:foo'] }, noop));
    runner.addJourney(new Journey({ name: 'j2', tags: ['hello:bar'] }, noop));
    runner.addJourney(new Journey({ name: 'j3', tags: ['hello:baz'] }, noop));
    expect(
      await runner.run({
        ...defaultRunOptions,
        tags: ['!hello:b*'],
      })
    ).toEqual({
      j1: { status: 'succeeded' },
    });
  });

  it('run api - accumulate failed journeys', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    const j2 = new Journey({ name: 'j2' }, noop);
    const error = new Error('broken journey');
    j2.addStep('step1', async () => {
      throw error;
    });
    runner.addJourney(j2);
    const result = await runner.run(defaultRunOptions);
    expect(result).toEqual({
      j1: { status: 'succeeded' },
      j2: { status: 'failed', error },
    });
  });

  it('run api - dry run', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'j2' }, noop));
    let count = 0;
    class DryRunReporter implements Reporter {
      onJourneyRegister() {
        count++;
      }
    }
    const result = await runner.run({
      ...defaultRunOptions,
      reporter: DryRunReporter,
      dryRun: true,
    });
    expect(result).toEqual({});
    expect(count).toBe(2);
  });

  it('run - should preserve order hooks/journeys/steps', async () => {
    const result = [];
    runner.addHook('beforeAll', async () => result.push('beforeAll1'));
    runner.addHook('afterAll', async () => result.push('afterAll1'));
    const j1 = new Journey({ name: 'j1' }, noop);
    j1.addHook('before', () => result.push('before1'));
    j1.addHook('after', () => result.push('after1'));
    j1.addStep('s1', () => result.push('step1'));
    const j2 = new Journey({ name: 'j1' }, noop);
    runner.addHook('beforeAll', () => result.push('beforeAll2'));
    runner.addHook('afterAll', () => result.push('afterAll2'));
    j2.addHook('before', () => result.push('before2'));
    j2.addHook('after', () => result.push('after2'));
    j2.addStep('s2', () => result.push('step2'));
    runner.addJourney(j1);
    runner.addJourney(j2);

    await runner.run(defaultRunOptions);
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
    const result = [];
    runner.addHook('beforeAll', ({ params, env }) =>
      result.push({ name: 'beforeAll', params, env })
    );
    runner.addHook('afterAll', ({ params }) =>
      result.push({ name: 'afterAll', params })
    );
    const j1 = new Journey({ name: 'j1' }, noop);
    j1.addHook('before', ({ params }) => {
      result.push({ name: 'before', params });
    });
    j1.addHook('after', ({ params, env }) => {
      result.push({ name: 'after', params, env });
    });
    j1.addStep('s1', () => result.push('step1'));
    runner.addJourney(j1);

    const params = {
      url: 'http://local.dev',
    };
    await runner.run({
      ...defaultRunOptions,
      params,
      environment: 'testing',
    });

    expect(result).toEqual([
      { name: 'beforeAll', params, env: 'testing' },
      { name: 'before', params },
      'step1',
      { name: 'after', params, env: 'testing' },
      { name: 'afterAll', params },
    ]);
  });

  it('run - supports custom reporters', async () => {
    let reporter;
    class CustomReporter implements Reporter {
      messages: string[] = [];
      constructor() {
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

    runner.addJourney(new Journey({ name: 'foo' }, noop));
    const result = await runner.run({
      ...defaultRunOptions,
      reporter: CustomReporter,
    });
    expect(result).toEqual({
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

  it('run api - verify screenshots', async () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const s1 = j1.addStep('j1s1', noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    const s2 = j2.addStep('j2s2', noop);
    runner.addJourney(j1);
    runner.addJourney(j2);

    await runner.run({
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
    runner.addJourney(j1);

    await runner.run({
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
      });
    });
    const runOptions = { ...defaultRunOptions, trace: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const [step1, step2] = await runner.runSteps(j1, context, runOptions);
    await Gatherer.stop();
    expect(step1.metrics).toBeUndefined();
    expect(step1.traces).toBeUndefined();
    expect(step2.traces.length).toBeGreaterThan(0);
    expect(step2.metrics).toMatchObject({
      cls: 0,
      fcp: {
        us: expect.any(Number),
      },
    });
  });

  it('run - timestamps must be in order', async () => {
    const j1 = journey('journey1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    runner.addJourney(j1);
    await runner.run({
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

  it('runner - build monitors with local config', async () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    j1.updateMonitor({
      id: 'test-j1',
      schedule: 2,
      locations: ['Europe - United Kingdom'],
    });
    j2.updateMonitor({ throttling: { latency: 1000 } });
    runner.addJourney(j1);
    runner.addJourney(j2);

    const monitors = runner.buildMonitors({
      ...getDefaultMonitorConfig(),
    });
    expect(monitors.length).toBe(2);
    expect(monitors[0].config).toEqual({
      id: 'test-j1',
      name: 'j1',
      tags: [],
      locations: ['Europe - United Kingdom'],
      schedule: 2,
      params: undefined,
      playwrightOptions: undefined,
      throttling: { download: 5, latency: 20, upload: 3 },
    });
    expect(monitors[1].config).toMatchObject({
      locations: ['North America - US East'],
      schedule: 10,
      throttling: { latency: 1000 },
    });
  });

  it('runner - build monitors with global config', async () => {
    runner.updateMonitor({
      schedule: 5,
      throttling: { download: 100, upload: 50 },
      params: { env: 'test' },
      playwrightOptions: { ignoreHTTPSErrors: true },
    });

    const j1 = new Journey({ name: 'j1', tags: ['foo*'] }, noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    j1.updateMonitor({
      id: 'test-j1',
      schedule: 2,
      locations: ['Europe - United Kingdom'],
    });
    j2.updateMonitor({ throttling: { latency: 1000 } });
    runner.addJourney(j1);
    runner.addJourney(j2);

    const monitors = runner.buildMonitors({
      ...getDefaultMonitorConfig(),
    });
    expect(monitors.length).toBe(2);
    expect(monitors[0].config).toEqual({
      id: 'test-j1',
      name: 'j1',
      tags: ['foo*'],
      locations: ['Europe - United Kingdom'],
      schedule: 2,
      params: { env: 'test' },
      playwrightOptions: { ignoreHTTPSErrors: true },
      throttling: { download: 100, latency: 20, upload: 50 },
    });
    expect(monitors[1].config).toMatchObject({
      locations: ['North America - US East'],
      schedule: 5,
      throttling: { latency: 1000 },
    });
  });

  /**
   * Its really hard to ensure the journey/end is called for a real world page
   * without actually testing on a real world webpage.
   */
  it('run - ensure journey/end is written for real world pages', async () => {
    const j1 = journey('journey1', async ({ page }) => {
      step('load homepage', async () => {
        await page.goto('https://www.elastic.co');
      });
    });
    runner.addJourney(j1);
    await runner.run({
      ...defaultRunOptions,
      reporter: 'json',
      network: true,
      trace: true,
    });
    const events = readAndCloseStreamJson().map(event => event.type);
    expect(events[events.length - 1]).toBe('journey/end');
  });
});

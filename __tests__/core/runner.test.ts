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
import { Journey } from '../../src/dsl';
import { Server } from '../utils/server';
import { generateTempPath } from '../../src/helpers';
import { wsEndpoint } from '../utils/test-config';

describe('runner', () => {
  let runner: Runner, server: Server;
  const noop = () => {};
  const dest = generateTempPath();
  beforeEach(async () => {
    runner = new Runner();
  });
  beforeAll(async () => {
    server = await Server.create();
  });
  afterAll(async () => {
    await server.close();
    fs.unlinkSync(dest);
  });

  it('support emitting/subscribing to events', () => {
    runner.on('start', ({ numJourneys }) => {
      expect(numJourneys).toBe(1);
    });
    runner.emit('start', { numJourneys: 1 });
  });

  it('add journeys', () => {
    const j1 = new Journey({ name: 'j1' }, noop);
    const j2 = new Journey({ name: 'j2' }, noop);
    expect(runner.currentJourney).toBeNull();
    runner.addJourney(j1);
    expect(runner.currentJourney).toEqual(j1);
    runner.addJourney(j2);
    expect(runner.currentJourney).toEqual(j2);
    expect(runner.journeys.length).toBe(2);
  });

  it('add hooks', async () => {
    runner.addHook('beforeAll', noop);
    runner.addHook('afterAll', noop);
    expect(runner.hooks.beforeAll).toEqual([noop]);
    expect(runner.hooks.afterAll).toEqual([noop]);
  });

  it('run journey - with events payload', async () => {
    const journey = new Journey({ name: 'j1' }, noop);
    const step = journey.addStep('step1', noop);
    runner.on('journey:start', event => {
      expect(event).toMatchObject({
        journey,
        timestamp: expect.any(Number),
      });
    });
    runner.on('step:start', event => {
      expect(event).toMatchObject({
        journey,
        step,
      });
    });
    runner.on('step:end', event => {
      expect(event).toMatchObject({
        journey,
        step,
        status: 'succeeded',
        url: 'about:blank',
        start: expect.any(Number),
        end: expect.any(Number),
      });
    });
    runner.on('journey:end', event => {
      expect(event).toMatchObject({
        journey,
        status: 'succeeded',
        start: expect.any(Number),
        end: expect.any(Number),
      });
    });
    const result = await runner.runJourney(journey, { wsEndpoint });
    expect(result.status).toBe('succeeded');
  });

  it('run journey - failed when any step fails', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey.addStep('step1', noop);
    const error = new Error('Broken step 2');
    journey.addStep('step2', async () => {
      throw error;
    });
    const result = await runner.runJourney(journey, { wsEndpoint });
    expect(result).toEqual({
      status: 'failed',
      error,
    });
  });

  it('run journey - with hooks', async () => {
    const journey = new Journey({ name: 'with hooks' }, noop);
    journey.addHook('before', noop);
    journey.addHook('after', noop);
    const result = await runner.runJourney(journey, { wsEndpoint });
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
    const result = await runner.runJourney(journey, { wsEndpoint });
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
    const result = await runner.run({
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
    });
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
    const runOptions = { metrics: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, runOptions);
    await Gatherer.stop();
    expect(result).toEqual([
      {
        status: 'succeeded',
        metrics: expect.any(Object),
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
    const runOptions = {};
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, runOptions);
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
    const context = await Runner.createContext({});
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, {});
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
    const context = await Runner.createContext({});
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, {});
    await Gatherer.stop();
    expect(result).toEqual([
      {
        status: 'failed',
        url: 'about:blank',
        error: expect.any(Error),
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
    const runOptions = {};
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const [step1, step2] = await runner.runSteps(j1, context, runOptions);
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
    const result = await runner.run({
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
    });
    expect(result).toEqual({
      [name]: { status: 'succeeded' },
    });
  });

  it('run api - match journey name explict', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'j2' }, noop));
    expect(
      await runner.run({
        wsEndpoint,
        outfd: fs.openSync(dest, 'w'),
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
        wsEndpoint,
        outfd: fs.openSync(dest, 'w'),
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
        wsEndpoint,
        outfd: fs.openSync(dest, 'w'),
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
        wsEndpoint,
        outfd: fs.openSync(dest, 'w'),
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
        wsEndpoint,
        outfd: fs.openSync(dest, 'w'),
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
    const result = await runner.run({
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
    });
    expect(result).toEqual({
      j1: { status: 'succeeded' },
      j2: { status: 'failed', error },
    });
  });

  it('run api - dry run', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'j2' }, noop));
    let count = 0;
    runner.on('journey:register', () => count++);
    const result = await runner.run({
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
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

    await runner.run({
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
    });
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
      wsEndpoint,
      params,
      environment: 'testing',
      outfd: fs.openSync(dest, 'w'),
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
    class Reporter {
      messages: string[] = [];

      constructor(
        public readonly runner: Runner,
        public readonly options: any
      ) {
        reporter = this;

        this.runner.on('start', ({ numJourneys }) => {
          this.messages.push(`numJourneys ${numJourneys}`);
        });
        this.runner.on('journey:start', ({ journey }) => {
          this.messages.push(`journey:start ${journey.name}`);
        });
        this.runner.on('journey:end', ({ journey }) => {
          this.messages.push(`journey:end ${journey.name}`);
        });
        this.runner.on('end', () => {
          this.messages.push(`end`);
        });
      }
    }

    runner.addJourney(new Journey({ name: 'foo' }, noop));
    const result = await runner.run({
      reporter: Reporter,
      wsEndpoint,
      outfd: fs.openSync(dest, 'w'),
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
    expect(reporter.runner).toBeInstanceOf(Runner);
    expect(reporter.options).toEqual({
      fd: expect.any(Number),
    });
  });
});

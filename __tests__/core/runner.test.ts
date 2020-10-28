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
import { Server } from '../../utils/server';
import { generateTempPath } from '../../src/helpers';

describe('runner', () => {
  let runner: Runner, server: Server;
  const noop = async () => {};
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
        timestamp: expect.any(Number),
      });
    });
    runner.on('step:end', event => {
      expect(event).toMatchObject({
        journey,
        step,
        timestamp: expect.any(Number),
        status: 'succeeded',
        url: 'about:blank',
        start: expect.any(Number),
        end: expect.any(Number),
      });
    });
    runner.on('journey:end', event => {
      expect(event).toMatchObject({
        journey,
        timestamp: expect.any(Number),
        status: 'succeeded',
        start: expect.any(Number),
        end: expect.any(Number),
      });
    });
    const result = await runner.runJourney(journey, {});
    expect(result.status).toBe('succeeded');
  });

  it('run journey - failed when any step fails', async () => {
    const journey = new Journey({ name: 'failed-journey' }, noop);
    journey.addStep('step1', noop);
    const error = new Error('Broken step 2');
    journey.addStep('step2', async () => {
      throw error;
    });
    const result = await runner.runJourney(journey, {});
    expect(result).toEqual({
      status: 'failed',
      error,
    });
  });

  it('run journey - with hooks', async () => {
    const journey = new Journey({ name: 'with hooks' }, noop);
    journey.addHook('before', noop);
    journey.addHook('after', noop);
    const result = await runner.runJourney(journey, {});
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
    const result = await runner.runJourney(journey, {});
    expect(result).toEqual({
      status: 'failed',
      error,
    });
  });

  it('run step', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    const runOptions = { metrics: true, screenshots: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, runOptions);
    await Gatherer.dispose(context.driver);
    expect(result).toEqual([
      {
        status: 'succeeded',
        metrics: expect.any(Object),
        screenshot: expect.any(String),
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
    const runOptions = { screenshots: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const result = await runner.runSteps(j1, context, runOptions);
    await Gatherer.dispose(context.driver);
    expect(result).toEqual([
      {
        status: 'failed',
        error: expect.any(Error),
        screenshot: expect.any(String),
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
    const runOptions = { screenshots: true };
    const context = await Runner.createContext(runOptions);
    await runner.registerJourney(j1, context);
    const [step1, step2] = await runner.runSteps(j1, context, runOptions);
    await Gatherer.dispose(context.driver);
    expect(step1).toEqual({
      status: 'succeeded',
      url: server.TEST_PAGE,
      screenshot: expect.any(String),
    });
    expect(step2).toEqual({
      status: 'failed',
      error,
      screenshot: expect.any(String),
    });
  });

  it('run api', async () => {
    const name = 'test-journey';
    const journey = new Journey({ name }, noop);
    runner.addJourney(journey);
    const result = await runner.run({
      outfd: fs.openSync(dest, 'w'),
    });
    expect(result).toEqual({
      [name]: { status: 'succeeded' },
    });
  });

  it('run api - only runs specified journeyName', async () => {
    runner.addJourney(new Journey({ name: 'j1' }, noop));
    runner.addJourney(new Journey({ name: 'j2' }, noop));
    const result = await runner.run({
      outfd: fs.openSync(dest, 'w'),
      journeyName: 'j2',
    });
    expect(result).toEqual({
      j2: { status: 'succeeded' },
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
});

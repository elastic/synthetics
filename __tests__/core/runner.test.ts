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

  it('run step', async () => {
    const j1 = journey('j1', async ({ page }) => {
      step('step1', async () => {
        await page.goto(server.TEST_PAGE);
      });
    });
    const runOptions = { metrics: true, screenshots: true };
    const context = await Runner.context(runOptions);
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
    const context = await Runner.context(runOptions);
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
    const context = await Runner.context(runOptions);
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
});

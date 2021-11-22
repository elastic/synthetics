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

import { once, EventEmitter } from 'events';
import { join } from 'path';
import { rm } from 'fs/promises';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import { reporters, Reporter } from '../reporters';
import {
  CACHE_PATH,
  monotonicTimeInSeconds,
  getTimestamp,
  runParallel,
  generateUniqueId,
  mkdirAsync,
  writeFileAsync,
} from '../helpers';
import {
  StatusValue,
  HooksCallback,
  Params,
  NetworkConditions,
  PluginOutput,
  CliArgs,
  HooksArgs,
  PlaywrightOptions,
  Driver,
  Screenshot,
} from '../common_types';
import { PageMetrics, PluginManager } from '../plugins';
import { PerformanceManager } from '../plugins';
import { Gatherer } from './gatherer';
import { log } from './logger';

export type RunOptions = Omit<
  CliArgs,
  | 'debug'
  | 'pattern'
  | 'inline'
  | 'require'
  | 'reporter'
  | 'richEvents'
  | 'capability'
  | 'sandbox'
  | 'headless'
  | 'throttling'
> & {
  environment?: string;
  playwrightOptions?: PlaywrightOptions;
  networkConditions?: NetworkConditions;
  reporter?: CliArgs['reporter'] | Reporter;
};

type HookType = 'beforeAll' | 'afterAll';
export type SuiteHooks = Record<HookType, Array<HooksCallback>>;

type JourneyContext = {
  params?: Params;
  start: number;
  driver: Driver;
  pluginManager: PluginManager;
};

type StepResult = {
  status: StatusValue;
  url?: string;
  error?: Error;
  pagemetrics?: PageMetrics;
  filmstrips?: PluginOutput['filmstrips'];
  metrics?: PluginOutput['metrics'];
  traces?: PluginOutput['traces'];
};

type JourneyResult = {
  status: StatusValue;
  error?: Error;
  networkinfo?: PluginOutput['networkinfo'];
  browserconsole?: PluginOutput['browserconsole'];
};

type RunResult = Record<string, JourneyResult>;

interface StepEvent {
  step: Step;
  journey: Journey;
}

interface JourneyEvent {
  journey: Journey;
  timestamp: number;
  params?: Params;
}

interface Events {
  start: {
    numJourneys: number;
    networkConditions?: NetworkConditions;
  };
  'journey:register': {
    journey: Journey;
  };
  'journey:start': JourneyEvent;
  'journey:end': JourneyEvent &
    JourneyResult & {
      start: number;
      end: number;
      options: RunOptions;
      timestamp: number;
    };
  'journey:end:reported': unknown;
  'step:start': StepEvent;
  'step:end': StepEvent &
    StepResult & {
      start: number;
      end: number;
    };
  end: unknown;
}

export default interface Runner {
  on<K extends keyof Events>(name: K, listener: (v: Events[K]) => void): this;
  emit<K extends keyof Events>(event: K, args: Events[K]): boolean;
}

export default class Runner extends EventEmitter {
  active = false;
  currentJourney?: Journey = null;
  journeys: Journey[] = [];
  hooks: SuiteHooks = { beforeAll: [], afterAll: [] };
  hookError: Error | undefined;
  static screenshotPath = join(CACHE_PATH, 'screenshots');

  static async createContext(options: RunOptions): Promise<JourneyContext> {
    const driver = await Gatherer.setupDriver(options);
    /**
     * Do not include browser launch/context creation duration
     * as part of journey duration
     */
    const start = monotonicTimeInSeconds();
    const pluginManager = await Gatherer.beginRecording(driver, options);
    /**
     * For each journey we create the screenshots folder for
     * caching all screenshots and clear them at end of each journey
     */
    await mkdirAsync(this.screenshotPath, { recursive: true });
    return {
      start,
      params: options.params,
      driver,
      pluginManager,
    };
  }

  async captureScreenshot(page: Driver['page'], step: Step) {
    await page.waitForLoadState('load');
    const buffer = await page
      .screenshot({
        type: 'jpeg',
        quality: 80,
      })
      .catch(() => {});
    /**
     * Write the screenshot image buffer with additional details (step
     * information) which could be extracted at the end of
     * each journey without impacting the step timing information
     */
    if (buffer) {
      const fileName = `${generateUniqueId()}.json`;
      const screenshot: Screenshot = {
        step,
        timestamp: getTimestamp(),
        data: buffer.toString('base64'),
      };
      await writeFileAsync(
        join(Runner.screenshotPath, fileName),
        JSON.stringify(screenshot)
      );
    }
  }

  addHook(type: HookType, callback: HooksCallback) {
    this.hooks[type].push(callback);
  }

  addJourney(journey: Journey) {
    this.journeys.push(journey);
    this.currentJourney = journey;
  }

  async runBeforeAllHook(args: HooksArgs) {
    log(`Runner: beforeAll hooks`);
    await runParallel(this.hooks.beforeAll, args);
  }

  async runAfterAllHook(args: HooksArgs) {
    log(`Runner: afterAll hooks`);
    await runParallel(this.hooks.afterAll, args);
  }

  async runBeforeHook(journey: Journey, args: HooksArgs) {
    log(`Runner: before hooks for (${journey.name})`);
    await runParallel(journey.hooks.before, args);
  }

  async runAfterHook(journey: Journey, args: HooksArgs) {
    log(`Runner: after hooks for (${journey.name})`);
    await runParallel(journey.hooks.after, args);
  }

  async runStep(
    step: Step,
    context: JourneyContext,
    options: RunOptions
  ): Promise<StepResult> {
    const data: StepResult = {
      status: 'succeeded',
    };
    log(`Runner: start step (${step.name})`);
    const { metrics, screenshots, filmstrips, trace } = options;
    const { driver, pluginManager } = context;
    /**
     * URL needs to be the first navigation request of any step
     * Listening for request solves the case where `about:blank` would be
     * reported for failed navigations
     */
    const captureUrl = req => {
      if (!data.url && req.isNavigationRequest()) {
        data.url = req.url();
      }
      driver.context.off('request', captureUrl);
    };
    driver.context.on('request', captureUrl);

    try {
      /**
       * Set up plugin manager context and also register
       * step level plugins
       */
      const traceEnabled = trace || filmstrips;
      pluginManager.onStep(step);
      traceEnabled && (await pluginManager.start('trace'));
      // call the step definition
      await step.callback();
      /**
       * Collect all step level metrics
       */
      if (metrics) {
        data.pagemetrics = await (
          pluginManager.get('performance') as PerformanceManager
        ).getMetrics();
      }
      if (traceEnabled) {
        const traceOutput = await pluginManager.stop('trace');
        Object.assign(data, traceOutput);
      }
    } catch (error) {
      data.status = 'failed';
      data.error = error;
    } finally {
      /**
       * Capture screenshot for the newly created pages
       * via popup or new windows/tabs
       *
       * Last open page will get us the correct screenshot
       */
      const pages = driver.context.pages();
      const page = pages[pages.length - 1];
      if (page) {
        data.url ??= page.url();
        if (screenshots && screenshots !== 'off') {
          await this.captureScreenshot(page, step);
        }
      }
    }
    log(`Runner: end step (${step.name})`);
    return data;
  }

  async runSteps(
    journey: Journey,
    context: JourneyContext,
    options: RunOptions
  ) {
    const results: Array<StepResult> = [];
    let skipStep = false;
    for (const step of journey.steps) {
      const start = monotonicTimeInSeconds();
      this.emit('step:start', { journey, step });
      let data: StepResult = { status: 'succeeded' };
      if (skipStep) {
        data.status = 'skipped';
      } else {
        data = await this.runStep(step, context, options);
        /**
         * skip next steps if the previous step returns error
         */
        if (data.error) skipStep = true;
      }
      this.emit('step:end', {
        journey,
        step,
        start,
        end: monotonicTimeInSeconds(),
        ...data,
      });
      if (options.pauseOnError && data.error) {
        await new Promise(r => process.stdin.on('data', r));
      }
      results.push(data);
    }
    return results;
  }

  registerJourney(journey: Journey, context: JourneyContext) {
    this.currentJourney = journey;
    const timestamp = getTimestamp();
    const { params } = context;
    this.emit('journey:start', { journey, timestamp, params });
    /**
     * Load and register the steps for the current journey
     */
    journey.callback({ ...context.driver, params });
  }

  async endJourney(
    journey,
    result: JourneyContext & JourneyResult,
    options: RunOptions
  ) {
    const end = monotonicTimeInSeconds();
    const { pluginManager, start, status, error } = result;
    const pluginOutput = pluginManager.output();
    this.emit('journey:end', {
      journey,
      status,
      error,
      start,
      end,
      timestamp: getTimestamp(),
      options,
      ...pluginOutput,
      browserconsole: status == 'failed' ? pluginOutput.browserconsole : [],
    });
    /**
     * Wait for the all the reported events to be consumed aschronously
     * by reporter.
     */
    if (options.reporter === 'json') {
      await once(this, 'journey:end:reported');
    }
    // clear screenshots cache after each journey
    await rm(Runner.screenshotPath, { recursive: true, force: true });
  }

  /**
   * Simulate a journey run to capture errors in the beforeAll hook
   */
  async runFakeJourney(journey: Journey, options: RunOptions) {
    const start = monotonicTimeInSeconds();
    this.emit('journey:start', {
      journey,
      timestamp: getTimestamp(),
      params: options.params,
    });
    const result: JourneyResult = {
      status: 'failed',
      error: this.hookError,
    };
    this.emit('journey:end', {
      journey,
      timestamp: getTimestamp(),
      start,
      options,
      end: monotonicTimeInSeconds(),
      ...result,
    });
    if (options.reporter === 'json') {
      await once(this, 'journey:end:reported');
    }
    return result;
  }

  async runJourney(journey: Journey, options: RunOptions) {
    const result: JourneyResult = {
      status: 'succeeded',
    };
    const context = await Runner.createContext(options);
    log(`Runner: start journey (${journey.name})`);
    try {
      this.registerJourney(journey, context);
      const hookArgs = {
        env: options.environment,
        params: options.params,
      };
      await this.runBeforeHook(journey, hookArgs);
      const stepResults = await this.runSteps(journey, context, options);
      /**
       * Mark journey as failed if any intermediate step fails
       */
      for (const stepResult of stepResults) {
        if (stepResult.status === 'failed') {
          result.status = stepResult.status;
          result.error = stepResult.error;
        }
      }
      await this.runAfterHook(journey, hookArgs);
    } catch (e) {
      result.status = 'failed';
      result.error = e;
    } finally {
      await this.endJourney(journey, { ...context, ...result }, options);
      await Gatherer.dispose(context.driver);
    }
    log(`Runner: end journey (${journey.name})`);
    return result;
  }

  async init(options: RunOptions) {
    const { reporter, outfd, networkConditions } = options;
    /**
     * Set up the corresponding reporter and fallback
     */
    const Reporter =
      typeof reporter === 'function'
        ? reporter
        : reporters[reporter] || reporters['default'];
    new Reporter(this, { fd: outfd });
    this.emit('start', {
      numJourneys: this.journeys.length,
      networkConditions,
    });
    /**
     * Set up the directory for caching screenshots
     */
    await mkdirAsync(CACHE_PATH, { recursive: true });
  }

  async run(options: RunOptions) {
    const result: RunResult = {};
    if (this.active) {
      return result;
    }
    this.active = true;
    log(`Runner: run ${this.journeys.length} journeys`);
    this.init(options);
    await this.runBeforeAllHook({
      env: options.environment,
      params: options.params,
    }).catch(e => (this.hookError = e));

    const { dryRun, match, tags } = options;
    for (const journey of this.journeys) {
      /**
       * Used by heartbeat to gather all registered journeys
       */
      if (dryRun) {
        this.emit('journey:register', { journey });
        continue;
      }
      if (!journey.isMatch(match, tags)) {
        continue;
      }
      const journeyResult: JourneyResult = this.hookError
        ? await this.runFakeJourney(journey, options)
        : await this.runJourney(journey, options);
      result[journey.name] = journeyResult;
    }
    await Gatherer.stop();
    await this.runAfterAllHook({
      env: options.environment,
      params: options.params,
    });
    await this.reset();
    return result;
  }

  async reset() {
    /**
     * Clear all cache data stored for post processing by
     * the current synthetic agent run
     */
    await rm(CACHE_PATH, { recursive: true, force: true });
    this.currentJourney = null;
    this.journeys = [];
    this.active = false;
    this.emit('end', {});
  }
}

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

import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { Journey, Suite } from '../dsl/journey';
import { Step } from '../dsl/step';
import { reporters, Reporter } from '../reporters';
import {
  CACHE_PATH,
  monotonicTimeInSeconds,
  getTimestamp,
  runParallel,
  generateUniqueId,
} from '../helpers';
import {  getCombinations } from '../matrix';
import {
  HooksCallback,
  Params,
  HooksArgs,
  Driver,
  Screenshot,
  RunOptions,
  JourneyResult,
  StepResult,
  Location,
} from '../common_types';
import { PluginManager } from '../plugins';
import { PerformanceManager } from '../plugins';
import { Gatherer } from './gatherer';
import { log } from './logger';
import { Monitor, MonitorConfig } from '../dsl/monitor';

type HookType = 'beforeAll' | 'afterAll';
export type SuiteHooks = Record<HookType, Array<HooksCallback>>;

type JourneyContext = {
  params?: Params;
  start: number;
  driver: Driver;
  pluginManager: PluginManager;
};

type RunResult = Record<string, JourneyResult>;

export default class Runner {
  #active = false;
  #reporter: Reporter;
  #currentJourney?: Journey = null;
  journeys: Journey[] = [];
  suites: Map<Location, Suite> = new Map();
  hooks: SuiteHooks = { beforeAll: [], afterAll: [] };
  hookError: Error | undefined;
  monitor?: Monitor;
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
    await mkdir(this.screenshotPath, { recursive: true });
    return {
      start,
      params: options.params,
      driver,
      pluginManager,
    };
  }

  async captureScreenshot(page: Driver['page'], step: Step) {
    const buffer = await page
      .screenshot({
        type: 'jpeg',
        quality: 80,
        timeout: 5000,
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
      await writeFile(
        join(Runner.screenshotPath, fileName),
        JSON.stringify(screenshot)
      );
    }
  }

  get currentJourney() {
    return this.#currentJourney;
  }

  addHook(type: HookType, callback: HooksCallback) {
    this.hooks[type].push(callback);
  }

  updateMonitor(config: MonitorConfig) {
    if (!this.monitor) {
      this.monitor = new Monitor(config);
      return;
    }
    this.monitor.update(config);
  }

  addJourney(journey: Journey) {
    const journeySuite = this.suites.get(journey.location);
    if (journeySuite) {
      journeySuite.addJourney(journey);
    } else {
      const suite = new Suite(journey.location);
      suite.addJourney(journey);
      this.addSuite(suite);
    }
    this.journeys.push(journey);
    this.#currentJourney = journey;
  }

  addSuite(suite: Suite) {
    this.suites.set(suite.location, suite);
  }

  setReporter(options: RunOptions) {
    /**
     * Set up the corresponding reporter and fallback
     * to default reporter if not provided
     */
    const { reporter, outfd } = options;
    const Reporter =
      typeof reporter === 'function'
        ? reporter
        : reporters[reporter] || reporters['default'];
    this.#reporter = new Reporter({ fd: outfd });
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
      this.#reporter?.onStepStart?.(journey, step);
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
      this.#reporter?.onStepEnd?.(journey, step, {
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
    this.#currentJourney = journey;
    const timestamp = getTimestamp();
    const { params } = context;
    this.#reporter?.onJourneyStart?.(journey, {
      timestamp,
      params,
    });
    /**
     * Exeucute the journey callback which would
     * register the steps for the current journey
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
    const pluginOutput = await pluginManager.output();
    await this.#reporter?.onJourneyEnd?.(journey, {
      status,
      error,
      start,
      end,
      timestamp: getTimestamp(),
      options,
      ...pluginOutput,
      browserconsole: status == 'failed' ? pluginOutput.browserconsole : [],
    });
    // clear screenshots cache after each journey
    await rm(Runner.screenshotPath, { recursive: true, force: true });
  }

  /**
   * Simulate a journey run to capture errors in the beforeAll hook
   */
  async runFakeJourney(journey: Journey, options: RunOptions) {
    const start = monotonicTimeInSeconds();
    this.#reporter.onJourneyStart?.(journey, {
      timestamp: getTimestamp(),
      params: options.params,
    });
    const result: JourneyResult = {
      status: 'failed',
      error: this.hookError,
    };
    await this.#reporter.onJourneyEnd?.(journey, {
      timestamp: getTimestamp(),
      start,
      options,
      end: monotonicTimeInSeconds(),
      ...result,
    });
    return result;
  }

  async runJourney(journey: Journey, options: RunOptions) {
    const result: JourneyResult = { status: 'succeeded' };
    const params = Object.freeze({...options.params, ...journey.params});
    const playwrightOptions = { ...options.playwrightOptions, ...journey.playwrightOptions };
    const journeyOptions = { ...options, params, playwrightOptions };
    const context = await Runner.createContext(journeyOptions);
    log(`Runner: start journey (${journey.name})`);
    try {
      this.registerJourney(journey, context);
      const hookArgs = {
        env: options.environment,
        params: params,
      };
      await this.runBeforeHook(journey, hookArgs);
      const stepResults = await this.runSteps(journey, context, journeyOptions);
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
      await this.endJourney(journey, { ...context, ...result }, journeyOptions);
      await Gatherer.dispose(context.driver);
    }
    log(`Runner: end journey (${journey.name})`);
    return result;
  }

  async init(options: RunOptions) {
    this.setReporter(options);
    this.#reporter.onStart?.({
      numJourneys: this.journeys.length,
      networkConditions: options.networkConditions,
    });
    /**
     * Set up the directory for caching screenshots
     */
    await mkdir(CACHE_PATH, { recursive: true });
  }

  buildMonitors(options: RunOptions) {
    /* Build out monitors according to matrix specs */
    this.parseMatrix(options);

    /**
     * Update the global monitor configuration required for
     * setting defaults
     */  
    this.updateMonitor({
      throttling: options.throttling,
      schedule: options.schedule,
      locations: options.locations,
      privateLocations: options.privateLocations,
      params: options.params,
      playwrightOptions: options.playwrightOptions,
    });

    const { match, tags } = options;
    const monitors: Monitor[] = [];

    const journeys = this.getAllJourneys();

    for (const journey of journeys) {
      const params = Object.freeze({ ...options.params, ...this.monitor.config?.params, ...journey.params });
      const playwrightOptions = { ...options.playwrightOptions, ...this.monitor.config?.playwrightOptions, ...journey.playwrightOptions }
      if (!journey.isMatch(match, tags)) {
        continue;
      }
      this.#currentJourney = journey;
      /**
       * Execute dummy callback to get all monitor specific
       * configurations for the current journey
       */
      journey.callback({ params: params } as any);
      journey.monitor.update({ 
        ...this.monitor?.config,
        params: Object.keys(params).length ? params : undefined,
        playwrightOptions
      });

      /* Only overwrite name and id values when using matrix */
      if (journey.matrix) {
        journey.monitor.config.name = journey.name;
        journey.monitor.config.id = journey.id;
        journey.monitor.config.playwrightOptions = playwrightOptions;
      }
      journey.monitor.validate();
      monitors.push(journey.monitor);
    }
    return monitors;
  }

  async parseMatrix(options: RunOptions) {
    this.journeys.forEach(journey => {
      const { matrix: globalMatrix } = options;
      const { matrix: localMatrix } = journey;
      // local journey matrix takes priority over global matrix
      const matrix = localMatrix || globalMatrix;

      if (!matrix) {
        return;
      }

      if (!matrix.adjustments) {
        throw new Error('Please specify adjustments for your testing matrix');
      }


      if (matrix.adjustments.some(adjustment => !adjustment.name)) {
        throw new Error('Please specify a name for each adjustment');
      }

      const suite = this.suites.get(journey.location);
      suite.clearJourneys();
  
      const combinations = getCombinations(matrix);
      combinations.forEach(matrixParams => {
        const j = journey.clone();
        const { playwrightOptions, name, params } = matrixParams;
        if (playwrightOptions) {
          j.playwrightOptions = { ...options.playwrightOptions, ...playwrightOptions }
        }
        j.name = `${j.name} - ${name}`;
        j.id = `${j.id}-${name}`;
        j.params = params;
        j.matrix = matrix;
        this.addJourney(j);  
      });
    }) 
  }

  getAllJourneys() {
    const journeys = Array.from(this.suites.values()).reduce((acc, suite) => {
      const suiteJourneys = suite.entries;
      return [...acc, ...suiteJourneys];
    }, []);
    return journeys;
  }

  async run(options: RunOptions) {
    const result: RunResult = {};
    if (this.#active) {
      return result;
    }
    this.#active = true;
    log(`Runner: run ${this.journeys.length} journeys`);
    this.init(options);
    await this.runBeforeAllHook({
      env: options.environment,
      params: options.params,
    }).catch(e => (this.hookError = e));

    const { dryRun, match, tags } = options;

    this.parseMatrix(options);

    const journeys = this.getAllJourneys();

    for (const journey of journeys) {
      /**
       * Used by heartbeat to gather all registered journeys
       */
      if (dryRun) {
        this.#reporter.onJourneyRegister?.(journey);
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
    this.#currentJourney = null;
    this.journeys = [];
    this.#active = false;
    /**
     * Clear all cache data stored for post processing by
     * the current synthetic agent run
     */
    await rm(CACHE_PATH, { recursive: true, force: true });
    await this.#reporter?.onEnd?.();
  }
}

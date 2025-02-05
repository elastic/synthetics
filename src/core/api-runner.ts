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
import { Step } from '../dsl/step';
import { Reporter, reporters } from '../reporters';
import {
  CACHE_PATH,
  generateUniqueId,
  getTimestamp,
  monotonicTimeInSeconds,
  runAPIParallel,
} from '../helpers';
import {
  APIHooksArgs,
  APIHooksCallback,
  APIJourneyResult,
  Driver,
  RunOptions,
  Screenshot,
  StepResult,
} from '../common_types';
import { log } from './logger';
import { Monitor, MonitorConfig } from '../dsl/monitor';
import { APIJourney } from '../dsl';
import { APIRequestContext } from 'playwright-core';
import { APIGatherer } from './api-gatherer';

type HookType = 'beforeAll' | 'afterAll';
export type SuiteHooks = Record<HookType, Array<APIHooksCallback>>;

type APIRunResult = Record<string, APIJourneyResult>;

export interface APIRunnerInfo {
  /**
   * Processed configuration from the CLI args and the config file
   */
  readonly config: RunOptions;
  /**
   * Currently active journey
   */
  readonly currentJourney: APIJourney | undefined;
  /**
   * All registerd journeys
   */
  readonly journeys: APIJourney[];
}

export default class APIRunner implements APIRunnerInfo {
  #active = false;
  #reporter: Reporter;
  #currentJourney?: APIJourney = null;
  #journeys: APIJourney[] = [];
  #apiJourneys: APIJourney[] = [];
  #hooks: SuiteHooks = { beforeAll: [], afterAll: [] };
  #screenshotPath = join(CACHE_PATH, 'screenshots');
  #driver?: { request: APIRequestContext };
  #browserDelay = -1;
  #hookError: Error | undefined;
  #monitor?: Monitor;
  config: RunOptions;

  get currentJourney() {
    return this.#currentJourney;
  }

  get journeys() {
    return this.#journeys;
  }

  get apiJourneys() {
    return this.#apiJourneys;
  }

  get hooks() {
    return this.#hooks;
  }

  private async captureScreenshot(page: Driver['page'], step: Step) {
    try {
      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        timeout: 5000,
      });
      /**
       * Write the screenshot image buffer with additional details (step
       * information) which could be extracted at the end of
       * each journey without impacting the step timing information
       */
      const fileName = `${generateUniqueId()}.json`;
      const screenshot: Screenshot = {
        step,
        timestamp: getTimestamp(),
        data: buffer.toString('base64'),
      };
      await writeFile(
        join(this.#screenshotPath, fileName),
        JSON.stringify(screenshot)
      );
      log(`Runner: captured screenshot for (${step.name})`);
    } catch (_) {
      // Screenshot may fail sometimes, log and continue.
      log(`Runner: failed to capture screenshot for (${step.name})`);
    }
  }

  _addHook(type: HookType, callback: APIHooksCallback) {
    this.#hooks[type].push(callback);
  }

  private buildHookArgs() {
    return {
      env: this.config.environment,
      params: this.config.params,
      info: this as APIRunnerInfo,
    };
  }

  _updateMonitor(config: MonitorConfig) {
    if (!this.#monitor) {
      this.#monitor = new Monitor(config);
      return;
    }
    this.#monitor.update(config);
  }

  _addJourney(journey: APIJourney) {
    this.#journeys.push(journey);
    this.#currentJourney = journey;
  }

  private setReporter(options: RunOptions) {
    /**
     * Set up the corresponding reporter and fallback
     * to default reporter if not provided
     */
    const { reporter, outfd, dryRun } = options;
    const Reporter =
      typeof reporter === 'function'
        ? reporter
        : reporters[reporter] || reporters['default'];
    this.#reporter = new Reporter({ fd: outfd, dryRun });
  }

  async #runBeforeAllHook(args: APIHooksArgs) {
    log(`Runner: beforeAll hooks`);
    await runAPIParallel(this.#hooks.beforeAll, args);
  }

  async #runAfterAllHook(args: APIHooksArgs) {
    log(`Runner: afterAll hooks`);
    await runAPIParallel(this.#hooks.afterAll, args);
  }

  async #runBeforeHook(journey: APIJourney, args: APIHooksArgs) {
    log(`Runner: before hooks for (${journey.name})`);
    await runAPIParallel(journey._getHook('before'), args);
  }

  async #runAfterHook(journey: APIJourney, args: APIHooksArgs) {
    log(`Runner: after hooks for (${journey.name})`);
    await runAPIParallel(journey._getHook('after'), args);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async #runStep(step: Step, options: RunOptions): Promise<StepResult> {
    log(`Runner: start step (${step.name})`);

    const data: StepResult = {};
    try {
      /**
       * Set up plugin manager context and also register
       * step level plugins
       */
      APIGatherer.pluginManager.onStep(step);
      // invoke the step callback by extracting to a variable to get better stack trace
      const cb = step.cb;
      await cb();
      step.status = 'succeeded';
    } catch (error) {
      step.status = 'failed';
      step.error = error;
    } finally {
      /**
       * Collect all step level metrics and trace events
       */
    }
    log(`Runner: end step (${step.name})`);
    return data;
  }

  async #runSteps(journey: APIJourney, options: RunOptions) {
    const results: Array<StepResult> = [];
    const isOnlyExists = journey.steps.filter(s => s.only).length > 0;
    let skipStep = false;
    for (const step of journey.steps) {
      step._startTime = monotonicTimeInSeconds();
      this.#reporter?.onStepStart?.(journey, step);
      let data: StepResult = {};
      /**
       * Skip the step
       * - if the step is marked as skip
       * - if the previous step fails and the current step is not marked as soft
       * - if the step is not marked as only and there are steps marked as only
       */
      if (
        step.skip ||
        (skipStep && !step.only) ||
        (isOnlyExists && !step.only)
      ) {
        step.status = 'skipped';
      } else {
        data = await this.#runStep(step, options);
        /**
         * skip next steps if the previous step returns error
         */
        if (step.error && !step.soft) skipStep = true;
      }
      step.duration = monotonicTimeInSeconds() - step._startTime;
      this.#reporter?.onStepEnd?.(journey, step, data);
      if (options.pauseOnError && step.error) {
        await new Promise(r => process.stdin.on('data', r));
      }
      results.push(data);
    }
    return results;
  }

  async #startJourney(journey: APIJourney, options: RunOptions) {
    journey._startTime = monotonicTimeInSeconds();
    this.#driver = await APIGatherer.setupDriver(options);
    await APIGatherer.beginRecording(this.#driver, options);
    /**
     * For each journey we create the screenshots folder for
     * caching all screenshots and clear them at end of each journey
     */
    await mkdir(this.#screenshotPath, { recursive: true });
    const params = options.params;
    this.#reporter?.onJourneyStart?.(journey, {
      timestamp: getTimestamp(),
      params,
    });
    /**
     * Execute the journey callback which registers the steps for current journey
     */
    journey.cb({ ...this.#driver, params, info: this });
  }

  async #endJourney(
    journey: APIJourney,
    result: APIJourneyResult,
    options: RunOptions
  ) {
    // Enhance the journey results
    const pOutput = await APIGatherer.pluginManager.output();

    await this.#reporter?.onJourneyEnd?.(journey, {
      browserDelay: this.#browserDelay,
      timestamp: getTimestamp(),
      options,
      networkinfo: pOutput.networkinfo,
      browserconsole: [],
    });
    await APIGatherer.endRecording();
    await APIGatherer.dispose(this.#driver);
    // clear screenshots cache after each journey
    await rm(this.#screenshotPath, { recursive: true, force: true });
    return Object.assign(result, {
      networkinfo: pOutput.networkinfo,
      ...journey,
    });
  }

  /**
   * Simulate a journey run to capture errors in the beforeAll hook
   */
  async #runFakeJourney(journey: APIJourney, options: RunOptions) {
    const start = monotonicTimeInSeconds();
    this.#reporter.onJourneyStart?.(journey, {
      timestamp: getTimestamp(),
      params: options.params,
    });

    // Mark the journey as failed and report the hook error as journey error
    journey.status = 'failed';
    journey.error = this.#hookError;
    journey.duration = monotonicTimeInSeconds() - start;

    await this.#reporter.onJourneyEnd?.(journey, {
      timestamp: getTimestamp(),
      options,
      browserDelay: this.#browserDelay,
    });
    return journey;
  }

  async _runJourney(journey: APIJourney, options: RunOptions) {
    this.#currentJourney = journey;
    log(`Runner: start journey (${journey.name})`);
    let result: APIJourneyResult = {};
    const hookArgs = {
      env: options.environment,
      params: options.params,
      info: this,
    };
    try {
      await this.#startJourney(journey, options);
      await this.#runBeforeHook(journey, hookArgs);
      const stepResults = await this.#runSteps(journey, options);
      journey.status = 'succeeded';
      // Mark journey as failed if any one of the step fails
      for (const step of journey.steps) {
        if (step.status === 'failed') {
          journey.status = step.status;
          journey.error = step.error;
        }
      }
      result.stepsresults = stepResults;
    } catch (e) {
      journey.status = 'failed';
      journey.error = e;
    } finally {
      journey.duration = monotonicTimeInSeconds() - journey._startTime;
      // Run after hook on journey failure and capture the uncaught error as
      // journey error, hook is purposely run before to capture errors during reporting
      await this.#runAfterHook(journey, hookArgs).catch(e => {
        journey.status = 'failed';
        journey.error = e;
      });
      result = await this.#endJourney(journey, result, options);
    }
    log(`Runner: end journey (${journey.name})`);
    return result;
  }

  async #init(options: RunOptions) {
    this.setReporter(options);
    this.#reporter.onStart?.({
      numJourneys: this.#journeys.length,
      networkConditions: options.networkConditions,
    });
    /**
     * Set up the directory for caching screenshots
     */
    await mkdir(CACHE_PATH, { recursive: true });
  }

  async _run(options: RunOptions): Promise<APIRunResult> {
    this.config = options;
    let result: APIRunResult = {};
    if (this.#active) {
      return result;
    }
    this.#active = true;
    log(`Runner: run ${this.#journeys.length} journeys`);
    this.#init(options);
    const hookArgs = this.buildHookArgs();
    await this.#runBeforeAllHook(hookArgs).catch(e => (this.#hookError = e));
    const { dryRun, grepOpts } = options;

    // collect all journeys with `.only` annotation and skip the rest
    const onlyJourneys = this.#journeys.filter(j => j.only);
    if (onlyJourneys.length > 0) {
      this.#journeys = onlyJourneys;
    } else {
      // filter journeys based on tags and skip annotations
      this.#journeys = this.#journeys.filter(
        j => j._isMatch(grepOpts?.match, grepOpts?.tags) && !j.skip
      );
    }

    // Used by heartbeat to gather all registered journeys
    if (dryRun) {
      this.#journeys.forEach(journey =>
        this.#reporter.onJourneyRegister?.(journey)
      );
    } else if (this.#journeys.length > 0) {
      result = await this._runJourneys(options);
    }
    await this.#runAfterAllHook(hookArgs).catch(
      async () => await this._reset()
    );
    await this._reset();
    return result;
  }

  async _runJourneys(options: RunOptions) {
    const result: APIRunResult = {};
    const browserStart = monotonicTimeInSeconds();
    await APIGatherer.setupDriver(options);
    this.#browserDelay = monotonicTimeInSeconds() - browserStart;

    for (const journey of this.#journeys) {
      result[journey.name] = this.#hookError
        ? await this.#runFakeJourney(journey, options)
        : await this._runJourney(journey, options);
    }
    await APIGatherer.stop();
    return result;
  }

  async _reset() {
    this.#currentJourney = null;
    this.#journeys = [];
    this.#active = false;
    /**
     * Clear all cache data stored for post processing by
     * the current synthetic agent run
     */
    await rm(CACHE_PATH, { recursive: true, force: true });
    await this.#reporter?.onEnd?.();
  }
}

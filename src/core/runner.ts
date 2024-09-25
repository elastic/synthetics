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
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import { reporters, Reporter } from '../reporters';
import {
  CACHE_PATH,
  monotonicTimeInSeconds,
  getTimestamp,
  runParallel,
  generateUniqueId,
} from '../helpers';
import {
  HooksCallback,
  HooksArgs,
  Driver,
  Screenshot,
  RunOptions,
  JourneyResult,
  StepResult,
  PushOptions,
} from '../common_types';
import {
  PerformanceManager,
  filterBrowserMessages,
} from '../plugins';
import { Gatherer } from './gatherer';
import { log } from './logger';
import { Monitor, MonitorConfig } from '../dsl/monitor';

type HookType = 'beforeAll' | 'afterAll';
export type SuiteHooks = Record<HookType, Array<HooksCallback>>;

type RunResult = Record<string, JourneyResult>;

export interface RunnerInfo {
  /**
   * Processed configuration from the CLI args and the config file
   */
  readonly config: RunOptions;
  /**
   * Currently active journey
   */
  readonly journey: Journey | undefined;
  /**
   * All registerd journeys
   */
  readonly journeys: Journey[];
}

export default class Runner implements RunnerInfo {
  #active = false;
  #reporter: Reporter;
  #currentJourney?: Journey = null;
  #journeys: Journey[] = [];
  #hooks: SuiteHooks = { beforeAll: [], afterAll: [] };
  #screenshotPath = join(CACHE_PATH, 'screenshots');
  #driver?: Driver;
  #browserDelay = -1;
  #hookError: Error | undefined;
  #monitor?: Monitor;
  config: RunOptions;

  get journey() {
    return this.#currentJourney;
  }

  get journeys() {
    return this.#journeys;
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
      })
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

  _addHook(type: HookType, callback: HooksCallback) {
    this.#hooks[type].push(callback);
  }

  private buildHookArgs() {
    return { env: this.config.environment, params: this.config.params, info: this as RunnerInfo };
  }

  _updateMonitor(config: MonitorConfig) {
    if (!this.#monitor) {
      this.#monitor = new Monitor(config);
      return;
    }
    this.#monitor.update(config);
  }

  _addJourney(journey: Journey) {
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

  async #runBeforeAllHook(args: HooksArgs) {
    log(`Runner: beforeAll hooks`);
    await runParallel(this.#hooks.beforeAll, args);
  }

  async #runAfterAllHook(args: HooksArgs) {
    log(`Runner: afterAll hooks`);
    await runParallel(this.#hooks.afterAll, args);
  }

  async #runBeforeHook(journey: Journey, args: HooksArgs) {
    log(`Runner: before hooks for (${journey.name})`);
    await runParallel(journey._getHook('before'), args);
  }

  async #runAfterHook(journey: Journey, args: HooksArgs) {
    log(`Runner: after hooks for (${journey.name})`);
    await runParallel(journey._getHook('after'), args);
  }

  async #runStep(
    step: Step,
    options: RunOptions
  ): Promise<StepResult> {
    log(`Runner: start step (${step.name})`);
    const { metrics, screenshots, filmstrips, trace } = options;
    /**
     * URL needs to be the first navigation request of any step
     * Listening for request solves the case where `about:blank` would be
     * reported for failed navigations
     */
    const captureUrl = req => {
      if (!step.url && req.isNavigationRequest()) {
        step.url = req.url();
      }
      this.#driver.context.off('request', captureUrl);
    };
    this.#driver.context.on('request', captureUrl);

    const data: StepResult = {};
    const traceEnabled = trace || filmstrips;
    try {
      /**
       * Set up plugin manager context and also register
       * step level plugins
       */
      Gatherer.pluginManager.onStep(step);
      traceEnabled && (await Gatherer.pluginManager.start('trace'));
      // invoke the step callback by extracting to a variable to get better stack trace
      const cb = step.cb;
      await cb();
    } catch (error) {
      step.status = 'failed';
      step.error = error;
    } finally {
      /**
       * Collect all step level metrics and trace events
       */
      if (metrics) {
        data.pagemetrics = await (
          Gatherer.pluginManager.get('performance') as PerformanceManager
        ).getMetrics();
      }
      if (traceEnabled) {
        const traceOutput = await Gatherer.pluginManager.stop('trace');
        Object.assign(data, traceOutput);
      }
      /**
       * Capture screenshot for the newly created pages
       * via popup or new windows/tabs
       *
       * Last open page will get us the correct screenshot
       */
      const pages = this.#driver.context.pages();
      const page = pages[pages.length - 1];
      if (page) {
        step.url ??= page.url();
        if (screenshots && screenshots !== 'off') {
          await this.captureScreenshot(page, step);
        }
      }
    }
    log(`Runner: end step (${step.name})`);
    return data
  }

  async #runSteps(
    journey: Journey,
    options: RunOptions
  ) {
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

  async #startJourney(journey: Journey, options: RunOptions) {
    journey._startTime = monotonicTimeInSeconds();
    this.#driver = await Gatherer.setupDriver(options);
    await Gatherer.beginRecording(this.#driver, options);
    /**
     * For each journey we create the screenshots folder for
     * caching all screenshots and clear them at end of each journey
     */
    await mkdir(this.#screenshotPath, { recursive: true });
    const params = options.params
    this.#reporter?.onJourneyStart?.(journey, {
      timestamp: getTimestamp(),
      params,
    });
    /**
     * Exeucute the journey callback which registers the steps for current journey
     */
    journey.cb({ ...this.#driver, params });
  }

  async #endJourney(
    journey: Journey,
    result: JourneyResult,
    options: RunOptions
  ) {
    // Enhance the journey results
    const pOutput = await Gatherer.pluginManager.output();
    const bConsole = filterBrowserMessages(pOutput.browserconsole, journey.status);
    await this.#reporter?.onJourneyEnd?.(journey, {
      browserDelay: this.#browserDelay,
      timestamp: getTimestamp(),
      options,
      networkinfo: pOutput.networkinfo,
      browserconsole: bConsole,
    });
    await Gatherer.endRecording();
    await Gatherer.dispose(this.#driver)
    // clear screenshots cache after each journey
    await rm(this.#screenshotPath, { recursive: true, force: true });
    return Object.assign(result, {
      networkinfo: pOutput.networkinfo,
      browserconsole: bConsole,
      ...journey,
    });
  }

  /**
   * Simulate a journey run to capture errors in the beforeAll hook
   */
  async #runFakeJourney(journey: Journey, options: RunOptions) {
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

  async _runJourney(journey: Journey, options: RunOptions) {
    this.#currentJourney = journey;
    log(`Runner: start journey (${journey.name})`);
    let result: JourneyResult = {};
    const hookArgs = { env: options.environment, params: options.params, info: this };
    try {
      await this.#startJourney(journey, options);
      await this.#runBeforeHook(journey, hookArgs);
      const stepResults = await this.#runSteps(journey, options);
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
      })
      result = await this.#endJourney(journey, result, options);
    }
    log(`Runner: end journey (${journey.name})`);
    return result;
  }

  _buildMonitors(options: PushOptions) {
    /**
     * Update the global monitor configuration required for setting defaults
     */
    this._updateMonitor({
      throttling: options.throttling,
      schedule: options.schedule,
      locations: options.locations,
      privateLocations: options.privateLocations,
      params: options.params,
      playwrightOptions: options.playwrightOptions,
      screenshot: options.screenshots,
      tags: options.tags,
      alert: options.alert,
      retestOnFailure: options.retestOnFailure,
      enabled: options.enabled,
    });

    const monitors: Monitor[] = [];
    for (const journey of this.#journeys) {
      this.#currentJourney = journey;
      if (journey.skip) {
        throw new Error(
          `Journey ${journey.name} is skipped. Please remove the journey.skip annotation and try again.`
        );
      }
      /**
       * Before pushing a browser monitor, three things need to be done:
       *
       * - execute callback `monitor.use` in particular to get monitor configurations
       * - update the monitor config with global configuration
       * - filter out monitors based on matched tags and name after applying both
       *  global and local monitor configurations
       */
      journey.cb({ params: options.params } as any);
      const monitor = journey._getMonitor();
      monitor.update(this.#monitor?.config);
      if (
        !monitor.isMatch(
          options.grepOpts?.match,
          options.grepOpts?.tags
        )
      ) {
        continue;
      }
      monitor.validate();
      monitors.push(monitor);
    }
    return monitors;
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

  async _run(options: RunOptions): Promise<RunResult> {
    this.config = options;
    let result: RunResult = {};
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
    const onlyJournerys = this.#journeys.filter(j => j.only);
    if (onlyJournerys.length > 0) {
      this.#journeys = onlyJournerys;
    } else {
      // filter journeys based on tags and skip annotations
      this.#journeys = this.#journeys.filter(j => j._isMatch(grepOpts?.match, grepOpts?.tags) && !j.skip);
    }

    // Used by heartbeat to gather all registered journeys
    if (dryRun) {
      this.#journeys.forEach(journey => this.#reporter.onJourneyRegister?.(journey))
    } else if (this.#journeys.length > 0) {
      result = await this._runJourneys(options);
    }
    await this.#runAfterAllHook(hookArgs).catch(async () => await this._reset());
    await this._reset();
    return result;
  }

  async _runJourneys(options: RunOptions) {
    const result: RunResult = {};
    const browserStart = monotonicTimeInSeconds();
    await Gatherer.launchBrowser(options);
    this.#browserDelay = monotonicTimeInSeconds() - browserStart;

    for (const journey of this.#journeys) {
      const journeyResult: JourneyResult = this.#hookError
        ? await this.#runFakeJourney(journey, options)
        : await this._runJourney(journey, options);
      result[journey.name] = journeyResult;
    }
    await Gatherer.stop();
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

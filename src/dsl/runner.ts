import { chromium } from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import { reporters } from '../reporters';
import { getMilliSecs, getMonotonicTime } from '../helpers';
import { StatusValue, FilmStrip, NetworkInfo } from '../common_types';
import { PluginManager } from '../plugins';
import { PerformanceManager, Metrics } from '../plugins';

export type RunOptions = {
  params?: { [key: string]: any };
  environment?: string;
  reporter?: 'default' | 'json';
  headless?: boolean;
  screenshots?: boolean;
  dryRun?: boolean;
  journeyName?: string;
  pauseOnError?: boolean;
  network?: boolean;
  outfd?: number;
  metrics?: boolean;
};

interface Events {
  start: { numJourneys: number };
  'journey:start': { journey: Journey; params: { [key: string]: any } };
  'journey:end': {
    journey: Journey;
    params: { [key: string]: any };
    durationMs: number;
    filmstrips?: Array<FilmStrip>;
    networkinfo?: Array<NetworkInfo>;
  };
  'step:start': { journey: Journey; step: Step };
  'step:end': {
    timestamp: number;
    journey: Journey;
    step: Step;
    durationMs: number;
    url: string;
    status: StatusValue;
    screenshot?: string;
    error?: Error;
    metrics?: Metrics;
    start: number;
    end: number;
  };
  end: unknown;
}

export default class Runner {
  eventEmitter = new EventEmitter();
  currentJourney?: Journey = null;
  journeys: Journey[] = [];
  pluginManager: PluginManager;

  addJourney(journey: Journey) {
    this.journeys.push(journey);
    this.currentJourney = journey;
  }

  addStep(step: Step) {
    if (this.currentJourney) {
      this.currentJourney.steps.push(step);
    }
  }

  emit<K extends keyof Events>(e: K, v: Events[K]) {
    this.eventEmitter.emit(e, v);
  }

  on<K extends keyof Events>(e: K, cb: (v: Events[K]) => void) {
    this.eventEmitter.on(e, cb);
  }

  async run(runOptions: RunOptions) {
    const {
      params = {},
      reporter = 'default',
      headless,
      dryRun,
      screenshots,
      journeyName,
      network,
      outfd,
      metrics,
    } = runOptions;
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this, { fd: outfd });

    this.emit('start', { numJourneys: this.journeys.length });
    for (const journey of this.journeys) {
      // Skip journey if user is filtering only for a single one
      if (journeyName && journey.options.name != journeyName) {
        continue;
      }
      this.currentJourney = journey;
      const journeyStart = process.hrtime();
      const journeyTimestamp = Date.now() * 1000;
      this.emit('journey:start', { journey, params });

      let shouldSkip = false;
      // We must coerce headless into a boolean, undefined does not behave the same as false
      const browser = await chromium.launch({ headless: headless ?? true });
      const context = await browser.newContext();
      const page = await context.newPage();
      const client = await context.newCDPSession(page);
      const pluginManager = new PluginManager(client);
      screenshots && (await pluginManager.start('trace'));
      network && (await pluginManager.start('network'));
      metrics && (await pluginManager.start('performance'));

      for (const step of journey.steps) {
        const stepStart = getMonotonicTime();
        const stepStartEvent = { journey, step };
        this.emit('step:start', stepStartEvent);

        let screenshot: string,
          url: string,
          status: StatusValue,
          error: Error,
          metricsData: Metrics;
        try {
          if (dryRun || shouldSkip) {
            status = 'skipped';
          } else {
            await step.callback({ page, params, context, browser, client });
            if (metrics) {
              metricsData = await pluginManager
                .get(PerformanceManager)
                .getMetrics();
            }
            await page.waitForLoadState('load');
            if (screenshots) {
              screenshot = (await page.screenshot()).toString('base64');
            }
            url = page.url();
            status = 'succeeded';
          }
        } catch (e) {
          error = e;
          status = 'failed';
          shouldSkip = true;
        } finally {
          const stepEnd = getMonotonicTime();
          // TODO: remove duration
          const durationMs = (stepEnd - stepStart) * 1000;
          const stepEndEvent = {
            timestamp: journeyTimestamp,
            journey,
            step,
            durationMs,
            error,
            screenshot,
            url,
            status,
            metrics: metricsData,
            start: stepStart,
            end: stepEnd,
          };
          this.emit('step:end', stepEndEvent);
          if (runOptions.pauseOnError && error) {
            await new Promise(r => process.stdin.on('data', r));
          }
        }
      }

      const { filmstrips, networkinfo } = await pluginManager.output();
      const durationMs = getMilliSecs(journeyStart);
      this.emit('journey:end', {
        journey,
        params,
        durationMs,
        filmstrips,
        networkinfo,
      });
      await browser.close();
    }
    this.emit('end', {});
    this.reset();
  }

  reset() {
    this.currentJourney = null;
    this.journeys = [];
  }
}

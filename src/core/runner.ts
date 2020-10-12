import { EventEmitter } from 'events';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import { reporters } from '../reporters';
import { getMonotonicTime, getTimestamp } from '../helpers';
import { StatusValue, FilmStrip, NetworkInfo } from '../common_types';
import { PluginManager } from '../plugins';
import { PerformanceManager, Metrics } from '../plugins';
import { Driver, Gatherer } from './gatherer';
import { log } from './logger';

type RunParamaters = Record<string, any>;

export type RunOptions = {
  params?: RunParamaters;
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

type BaseContext = {
  timestamp: number;
  params: RunParamaters;
  start: number;
  end?: number;
};

type JourneyContext = BaseContext & {
  driver: Driver;
  pluginManager: PluginManager;
};

type StepResult = {
  status: StatusValue;
  url?: string;
  metrics?: Metrics;
  error?: Error;
  screenshot?: string;
};

type JourneyResult = {
  status: StatusValue;
  error?: Error;
};

type RunResult = Record<string, JourneyResult>;

interface Events {
  start: { numJourneys: number };
  'journey:register': {
    journey: Journey;
  };
  'journey:start': {
    journey: Journey;
    timestamp: number;
    params: RunParamaters;
  };
  'journey:end': BaseContext &
    JourneyResult & {
      journey: Journey;
      filmstrips?: Array<FilmStrip>;
      networkinfo?: Array<NetworkInfo>;
    };
  'step:start': { journey: Journey; step: Step; timestamp: number };
  'step:end': StepResult & {
    timestamp: number;
    start: number;
    end: number;
    journey: Journey;
    step: Step;
  };
  end: unknown;
}

export default class Runner {
  eventEmitter = new EventEmitter();
  currentJourney?: Journey = null;
  journeys: Journey[] = [];

  static async context(options: RunOptions): Promise<JourneyContext> {
    const timestamp = getTimestamp();
    const start = getMonotonicTime();
    const driver = await Gatherer.setupDriver(options.headless);
    const pluginManager = await Gatherer.beginRecording(driver, options);
    return {
      timestamp,
      start,
      params: options.params,
      driver,
      pluginManager,
    };
  }

  addJourney(journey: Journey) {
    this.journeys.push(journey);
    this.currentJourney = journey;
  }

  emit<K extends keyof Events>(e: K, v: Events[K]) {
    this.eventEmitter.emit(e, v);
  }

  on<K extends keyof Events>(e: K, cb: (v: Events[K]) => void) {
    this.eventEmitter.on(e, cb);
  }

  async runStep(
    step: Step,
    context: JourneyContext,
    options: RunOptions
  ): Promise<StepResult> {
    const data: StepResult = {
      status: 'succeeded',
    };
    log(`Runner: start step(${step.name})`);
    const { metrics, screenshots } = options;
    const { driver, pluginManager } = context;
    try {
      await step.callback();
      await driver.page.waitForLoadState('load');
      if (metrics) {
        data.metrics = await pluginManager.get(PerformanceManager).getMetrics();
      }
      data.url = driver.page.url();
    } catch (error) {
      data.status = 'failed';
      data.error = error;
    } finally {
      if (screenshots) {
        data.screenshot = (await driver.page.screenshot()).toString('base64');
      }
    }
    log(`Runner: end step(${step.name})`);
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
      const start = getMonotonicTime();
      const timestamp = getTimestamp();
      this.emit('step:start', { timestamp, journey, step });
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
        timestamp,
        journey,
        step,
        ...data,
        start,
        end: getMonotonicTime(),
      });
      if (options.pauseOnError && data.error) {
        await new Promise(r => process.stdin.on('data', r));
      }
      results.push(data);
    }
    return results;
  }

  async registerJourney(journey: Journey, context: JourneyContext) {
    this.currentJourney = journey;
    const { timestamp, params } = context;
    this.emit('journey:start', { journey, timestamp, params });
    /**
     * Load and register the steps for the current journey
     */
    await journey.callback({ ...context.driver, params });
  }

  async endJourney(journey, result: JourneyContext & JourneyResult) {
    const { timestamp, pluginManager, start, params, status, error } = result;
    const { filmstrips, networkinfo } = await pluginManager.output();
    this.emit('journey:end', {
      timestamp,
      journey,
      status,
      error,
      params,
      start,
      end: getMonotonicTime(),
      filmstrips,
      networkinfo,
    });
  }

  async runJourney(journey: Journey, options: RunOptions) {
    const result: JourneyResult = {
      status: 'succeeded',
    };
    log(`Runner: start journey(${journey.name})`);
    try {
      const context = await Runner.context(options);
      this.registerJourney(journey, context);
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
      await this.endJourney(journey, { ...context, ...result });
      await Gatherer.dispose(context.driver);
    } catch (e) {
      result.status = 'failed';
      result.error = e;
    }
    log(`Runner: end journey(${journey.name})`);
    return result;
  }

  async run(options: RunOptions) {
    const result: RunResult = {};
    const { reporter = 'default', journeyName, outfd } = options;
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this, { fd: outfd });

    this.emit('start', { numJourneys: this.journeys.length });
    for (const journey of this.journeys) {
      /**
       * Used by heartbeat to gather all registered journeys
       */
      if (options.dryRun) {
        this.emit('journey:register', { journey });
        continue;
      }
      // TODO: Replace functionality with journey.only
      if (journeyName && journey.name != journeyName) {
        continue;
      }
      const journeyResult = await this.runJourney(journey, options);
      result[journey.name] = journeyResult;
    }
    this.emit('end', {});
    this.reset();
    return result;
  }

  reset() {
    this.currentJourney = null;
    this.journeys = [];
  }
}

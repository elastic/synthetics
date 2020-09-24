import { EventEmitter } from 'events';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import { reporters } from '../reporters';
import { getMonotonicTime, getTimestamp } from '../helpers';
import { StatusValue, FilmStrip, NetworkInfo } from '../common_types';
import { PluginManager } from '../plugins';
import { PerformanceManager, Metrics } from '../plugins';
import { Driver, Gatherer } from './gatherer';

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
  url?: string;
  status: StatusValue;
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
  'journey:start': {
    journey: Journey;
    timestamp: number;
    params: RunParamaters;
  };
  'journey:end': {
    journey: Journey;
    timestamp: number;
    params: RunParamaters;
    start: number;
    end: number;
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
    const { metrics, screenshots } = options;
    const { driver, pluginManager, params } = context;
    try {
      await step.callback({ ...driver, params });
      await driver.page.waitForLoadState('load');
      if (metrics) {
        data.metrics = await pluginManager.get(PerformanceManager).getMetrics();
      }
      if (screenshots) {
        data.screenshot = (await driver.page.screenshot()).toString();
      }
      data.url = driver.page.url();
    } catch (error) {
      data.status = 'failed';
      data.error = error;
    }
    return data;
  }

  async runSteps(
    journey: Journey,
    context: JourneyContext,
    options: RunOptions
  ) {
    let skipStep = false;
    for (const step of journey.steps) {
      const start = getMonotonicTime();
      const timestamp = getTimestamp();
      this.emit('step:start', { timestamp, journey, step });
      let data: StepResult;
      if (options.dryRun || skipStep) {
        data.status = 'skipped';
      } else {
        data = await this.runStep(step, context, options);
      }
      /**
       * skip next steps if the previous step returns error
       */
      skipStep = true;
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
    }
  }

  beginJourney(journey: Journey, context: JourneyContext) {
    this.currentJourney = journey;
    const { timestamp, params } = context;
    this.emit('journey:start', { journey, timestamp, params });
  }

  async endJourney(journey, context: JourneyContext) {
    const { timestamp, pluginManager, start, params, driver } = context;
    const { filmstrips, networkinfo } = await pluginManager.output();
    this.emit('journey:end', {
      timestamp,
      journey,
      params,
      start,
      end: getMonotonicTime(),
      filmstrips,
      networkinfo,
    });
    await driver.browser.close();
  }

  async runJourney(journey: Journey, options: RunOptions) {
    const journeyResult: JourneyResult = {
      status: 'succeeded',
    };
    try {
      const { headless, params } = options;
      const timestamp = getTimestamp();
      const start = getMonotonicTime();
      const driver = await Gatherer.setupDriver(headless);
      const pluginManager = await Gatherer.beginRecording(driver, options);
      const context: JourneyContext = {
        timestamp,
        start,
        params,
        driver,
        pluginManager,
      };
      this.beginJourney(journey, context);
      await this.runSteps(journey, context, options);
      await this.endJourney(journey, context);
    } catch (e) {
      journeyResult.status = 'failed';
      journeyResult.error = e;
    }
    return journeyResult;
  }

  async run(options: RunOptions) {
    const result: RunResult = {};
    const { reporter = 'default', journeyName, outfd } = options;

    this.emit('start', { numJourneys: this.journeys.length });
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this, { fd: outfd });

    for (const journey of this.journeys) {
      // TODO: Replace functionality with journey.only
      if (journeyName && journey.options.name != journeyName) {
        continue;
      }
      const journeyResult = await this.runJourney(journey, options);
      result[journey.options.name] = journeyResult;
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

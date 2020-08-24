import * as playwright from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import { reporters } from '../reporters';
import { getMilliSecs } from '../helpers';
import patchConsole from '../patch/console';

type RunOptions = {
  params: { [key: string]: any };
  environment: string;
  reporter?: 'default' | 'json';
  browserType?: string;
  headless?: boolean;
  screenshots?: boolean;
  debug?: boolean;
};

interface Events {
  start: { numJourneys: number };
  'journey:start': { journey: Journey; params: { [key: string]: any } };
  'journey:end': {
    journey: Journey;
    params: { [key: string]: any };
    elapsedMs: number;
    error: Error;
  };
  'step:start': { journey: Journey; step: Step };
  'step:end': {
    journey: Journey;
    step: Step;
    elapsedMs: number;
    error: Error;
    screenshot: string;
    url: string;
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

  init(options: RunOptions) {
    patchConsole(options.debug);
  }

  async run(options: RunOptions) {
    const {
      browserType = 'chromium',
      params,
      reporter = 'default',
      headless,
      screenshots
    } = options;
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this);
    /**
     * Initialize the runner with required settings
     */
    this.init(options);

    this.emit('start', { numJourneys: this.journeys.length });
    for (const journey of this.journeys) {
      this.currentJourney = journey;

      let error: Error;
      const journeyStart = process.hrtime();
      const browser: playwright.Browser = await playwright[browserType].launch({
        headless: headless
      });
      const context = await browser.newContext();
      const page = await context.newPage();

      this.emit('journey:start', { journey, params });
      for (const step of journey.steps) {
        this.emit('step:start', { journey, step });

        const stepStart = process.hrtime();
        let screenshot: string, url: string;
        try {
          await step.callback(page, params, { context, browser });
          await page.waitForLoadState('load');
          if (screenshots) {
            screenshot = (await page.screenshot()).toString('base64');
          }
          url = page.url();
        } catch (e) {
          error = e;
          break; // Don't run anymore steps if we catch an error
        } finally {
          const elapsedMs = getMilliSecs(stepStart);
          this.emit('step:end', {
            journey,
            step,
            elapsedMs,
            error,
            screenshot,
            url
          });
        }
      }
      const elapsedMs = getMilliSecs(journeyStart);
      this.emit('journey:end', { journey, params, elapsedMs, error });
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

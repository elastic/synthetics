import * as playwright from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import { reporters } from '../reporters';
import { getMilliSecs } from '../helpers';
import { StatusValue as StatusValue } from '../common_types';

export type RunOptions = {
  params: { [key: string]: any };
  environment: string;
  reporter?: 'default' | 'json';
  browserType?: string;
  headless?: boolean;
  screenshots?: boolean;
  dryRun?: boolean;
  journeyName?: string;
};

interface Events {
  start: { numJourneys: number };
  'journey:start': { journey: Journey; params: { [key: string]: any } };
  'journey:end': {
    journey: Journey;
    params: { [key: string]: any };
    durationMs: number;
    error: Error;
  };
  'step:start': { journey: Journey; step: Step };
  'step:end': {
    journey: Journey;
    step: Step;
    durationMs: number;
    error: Error;
    screenshot: string;
    url: string;
    status: StatusValue;
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

  async run(runOptions: RunOptions) {
    const { browserType = 'chromium', params, reporter = 'default' } = runOptions;
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this);

    this.emit('start', { numJourneys: this.journeys.length });
    for (const journey of this.journeys) {
      // Skip journey if user is filtering only for a single one
      if (runOptions.journeyName && journey.options.name != runOptions.journeyName) {
        continue;
      }

      let error: Error = undefined;
      const journeyStart = process.hrtime();
      const browser: playwright.Browser = await playwright[browserType].launch({
        headless: runOptions.headless
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      this.currentJourney = journey;
      this.emit('journey:start', { journey, params });
      for (const step of journey.steps) {
        this.emit('step:start', { journey, step });

        const stepStart = process.hrtime();
        let screenshot: string;
        let url: string;
        let status: StatusValue;
        try {
          // We hit an error in a previous test, but still want to emit the steps as skipped
          if (error) { 
            status = 'skipped';
          } else {
            if (!runOptions.dryRun) {
              await step.callback(page, params, { context, browser });
              await page.waitForLoadState('load');
              if (runOptions.screenshots) {
                screenshot = (await page.screenshot()).toString('base64');
              }
              url = page.url()
              status = 'succeeded';
            } else {
              status = 'skipped';
            }
          }
        } catch (e) {
          error = e;
          status = 'failed';
        } finally {
          const durationMs = getMilliSecs(stepStart);
          this.emit('step:end', {
            journey,
            step,
            durationMs,
            error,
            screenshot,
            url,
            status,
          });
        }
      }
      const durationMs = getMilliSecs(journeyStart);
      this.emit('journey:end', { journey, params, durationMs, error });
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

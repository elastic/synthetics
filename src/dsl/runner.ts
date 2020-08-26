import playwright, { ChromiumBrowserContext, Browser } from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import { reporters } from '../reporters';
import { getMilliSecs } from '../helpers';
import { StatusValue, FilmStrips } from '../common_types';
import { Tracing, filterFilmstrips } from '../plugins/Tracing';

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
    filmstrips: FilmStrips;
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
  _tracing = new Tracing();

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
      browserType = 'chromium',
      params,
      reporter = 'default',
      headless,
      dryRun,
      screenshots,
      journeyName
    } = runOptions;
    /**
     * Set up the corresponding reporter
     */
    const Reporter = reporters[reporter];
    new Reporter(this);

    this.emit('start', { numJourneys: this.journeys.length });
    for (const journey of this.journeys) {
      // Skip journey if user is filtering only for a single one
      if (journeyName && journey.options.name != journeyName) {
        continue;
      }
      this.currentJourney = journey;
      const journeyStart = process.hrtime();

      this.emit('journey:start', { journey, params });

      const browser: Browser = await playwright[browserType].launch({
        headless: headless
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      let shouldSkip = false;
      let client;
      if (screenshots && browserType === 'chromium') {
        client = await (context as ChromiumBrowserContext).newCDPSession(page);
        await this._tracing.start(client);
      }

      for (const step of journey.steps) {
        const stepStart = process.hrtime();
        this.emit('step:start', { journey, step });

        let screenshot: string, url: string;
        let status: StatusValue;
        let error: Error;
        try {
          if (runOptions.dryRun || shouldSkip) {
            status = 'skipped';
          } else {
            await step.callback(page, params, { context, browser });
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
          const durationMs = getMilliSecs(stepStart);
          this.emit('step:end', {
            journey,
            step,
            durationMs,
            error,
            screenshot,
            url,
            status
          });
        }
      }

      let filmstrips = [];
      if (client && screenshots) {
        const data = await this._tracing.stop(client);
        filmstrips = filterFilmstrips(data);
      }

      const durationMs = getMilliSecs(journeyStart);
      this.emit('journey:end', {
        journey,
        params,
        durationMs,
        filmstrips
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

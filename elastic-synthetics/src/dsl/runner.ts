import * as playwright from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import { reporters } from '../reporters';

type RunOptions = {
    params: { [key: string]: any };
    environment: string;
    reporter?: 'default' | 'json';
    browserType?: string;
};

interface Events {
    start: {numJourneys: number}
    journeyStart: {journey: Journey, params: {[key: string]: any}}
    journeyEnd: {journey: Journey, params: {[key: string]: any}, elapsedMs: number, error: Error}
    stepStart: {journey: Journey, step: Step}
    stepEnd: {journey: Journey, step: Step, elapsedMs: number, error: Error, screenshot: string}
    end: {};
}

export default class Runner {
    eventEmitter = new EventEmitter;
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

    async run(options: RunOptions) {
        const {
            browserType = 'chromium',
            params,
            reporter = 'default'
        } = options;
        /**
         * Set up the corresponding reporter
         */
        const Reporter = reporters[reporter];
        new Reporter(this);

        this.emit('start', {numJourneys: this.journeys.length});
        for (const journey of this.journeys) {
            let error: Error = undefined
            const journeyStarted = new Date().getTime();
            const browser = await playwright[browserType].launch({
                headless: false
            });
            const context = await browser.newContext();
            const page = await context.newPage();
            this.currentJourney = journey;
            this.emit('journeyStart', {journey, params});
            for (const step of journey.steps) {
                this.emit('stepStart', {journey, step});

                const started = new Date().getTime();
                let screenshot: string;
                try {
                    await step.callback(page, params, { context, browser });
                    await page.waitForLoadState('load');
                    screenshot = (await page.screenshot()).toString('base64');
                } catch(e) {
                    error = e;;
                    break; // Don't run anymore steps if we catch an error
                } finally {
                    const ended = new Date().getTime();
                    const elapsedMs = ended-started;
                    this.emit('stepEnd', {journey, step, elapsedMs, error, screenshot})
                }
            }
            await browser.close();

            const journeyEnded = new Date().getTime();
            const elapsedMs = journeyEnded-journeyStarted;
            this.emit('journeyEnd', {journey, params, elapsedMs, error})
        }
        this.emit('end', {});
        this.reset();
    }

    reset() {
        this.currentJourney = null;
        this.journeys = [];
    }
}

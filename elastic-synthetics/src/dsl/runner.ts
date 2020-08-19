import * as playwright from 'playwright';
import { EventEmitter } from 'events';
import { Journey } from './journey';
import { Step } from './step';
import BaseReporter from '../reporters/base';
import { report } from 'process';

type RunOptions = {
    params: { [key: string]: any };
    environment: string;
    reporter?: typeof BaseReporter;
    browserType?: string;
};

export default class Runner extends EventEmitter {
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

    async run(options: RunOptions) {
        const {
            browserType = 'chromium',
            params,
            reporter = BaseReporter
        } = options;
        /**
         * Set up the corresponding reporter
         */
        new reporter(this);

        this.emit('start', this.journeys.length);
        for (const journey of this.journeys) {
            const browser = await playwright[browserType].launch({
                headless: false
            });
            const context = await browser.newContext();
            const page = await context.newPage();
            this.currentJourney = journey;
            this.emit('journey', journey, params);
            for (const step of journey.steps) {
                this.emit('step', journey, step);
                await step.callback(page, params, { context, browser });
            }
            await browser.close();
        }
        this.emit('end');
        this.reset();
    }

    reset() {
        this.currentJourney = null;
        this.journeys = [];
    }
}

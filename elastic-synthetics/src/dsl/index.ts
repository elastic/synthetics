import { Journey, JourneyCallback, JourneyOptions } from './journey';
import { Step, StepCallback } from './step';

class State {
    journeys: Journey[];
    currentJourney?: Journey;

    constructor() {
        this.reset();
    }

    public reset() {
        this.journeys = [];
        this.currentJourney = undefined;
    }
}

export const state = new State();

export const journey = (
    options: JourneyOptions | string,
    callback: JourneyCallback
) => {
    if (typeof options === 'string') {
        options = { name: options, id: options };
    }
    const j = new Journey(options, callback);
    state.journeys.push(j);
    state.currentJourney = j;

    j.callback(); // load steps
};

export const step = (name: string, callback: StepCallback) => {
    const step = new Step(name, callback);
    state.currentJourney.steps.push(step);
};

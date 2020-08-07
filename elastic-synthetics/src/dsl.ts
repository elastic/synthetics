import { Page, BrowserContext, Browser } from 'playwright';

type State = {
    journeys: Journey[]
    currentJourney: Journey
}

type JourneyOptions = {
    name: string,
    id?: string
}

type Journey = {
    options: JourneyOptions,
    callback: JourneyCallback,
    steps: Step[],
}

type Step = {
    name: string,
    callback: StepCallback
}

type StepCallback = (params: any) => void;

type JourneyCallback = (page: Page, browserContext: BrowserContext, browser: Browser) => void;

export const state: State = {
    journeys: [],
    currentJourney: null
}


export const journey = (options: JourneyOptions | string, callback: JourneyCallback) => {
    if (typeof options === 'string') {
        options = {name: options, id: options}
    }
    state.journeys.push({
        options,
        callback,
        steps: []
    })
}

export const step = (name: string, callback: StepCallback) => {
    state.currentJourney.steps.push({ name, callback })
}
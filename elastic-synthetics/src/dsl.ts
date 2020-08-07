import { Page, BrowserContext, Browser } from 'playwright';

export const state = {
    journeys: [],
    currentJourney: null
}

type JourneyCallback = (page: Page, browserContext: BrowserContext, browser: Browser) => void;

export const journey = (options: {name: string}, callback: JourneyCallback) => {
    state.journeys.push({
        options,
        callback,
        steps: []
    })
}

export const step = (name: string, callback: () => void) => {
    state.currentJourney.steps.push({ name, callback })
}
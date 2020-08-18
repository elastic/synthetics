import { state, journey, step } from '../dsl';
import * as playwright from 'playwright';
const browserType = 'chromium'

export const runJourneys = async (suiteParams: any) => {
    console.debug("Running with suite params", suiteParams);
    const browser = await playwright[browserType].launch({ headless: false });
    const context = await browser.newContext()
    const page = await context.newPage()
    console.log(`Found ${state.journeys.length} journeys`)
    for (let i = 0; i < state.journeys.length; i++) {
        const journey = state.currentJourney = state.journeys[i]
        console.log(`Journey: ${journey.options.name}`)
        for (let j = 0; j < journey.steps.length; j++) {
            const step = journey.steps[j]
            console.log(`Step: ${step.name}`)
            await step.callback(page, suiteParams, {context, browser})
        }
    }

    await browser.close()
}

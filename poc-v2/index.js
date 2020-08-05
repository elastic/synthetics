const playwright = require('playwright')

const synthetic = require('./synthetic')
const { state, journey, step } = synthetic
global.journey = journey
global.step = step

//TODO: replace this with directory pattern
require('./test.journey')

const browserType = 'chromium'
async function run() {
    const browser = await playwright[browserType].launch({ headless: false });
    const context = await browser.newContext()
    const page = await context.newPage()
    for (let i = 0; i < state.journeys.length; i++) {
        const journey = state.currentJourney = state.journeys[i]
        console.log(`Journey: ${journey.options.name}`)
        state.currentJourney.callback(page)
        for (let j = 0; j < journey.steps.length; j++) {
            const step = journey.steps[j]
            console.log(`Step: ${step.name}`)
            await step.callback()
        }
    }

    await browser.close()
}

(async function () { await run() })()
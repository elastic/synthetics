import { state } from './dsl';
const playwright = require('playwright')

const browserType = 'chromium'

export const run = async () => {
    const browser = await playwright[browserType].launch({ headless: false });
    const context = await browser.newContext()
    const page = await context.newPage()
    console.log(`Found ${state.journeys.length} journeys`)
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

/*
import { resolve } from 'path';
import { promises } from 'fs';


export const loadJourneys = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map((entry) => {
        const res = resolve(dir, entry.name);
        if (entry.isDirectory) {
            loadJourneys(res); // recurse deeper
        } else if (entry.name.match(/.*\.journey\.js$/)) {
            console.log("REQ", res)
            require(res);
        }
  }));
}

*/
/*
process.on('unhandledRejection', error => {
  console.error('unhandledRejection', error);
});


(async function () { 
    try {
        const testDir = process.argv[process.argv.length-1];
        console.log(`Running tests in ${testDir}`)
        await loadJourneys(testDir); 
        await run() 
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})()
*/
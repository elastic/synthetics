import { state, journey, step } from './dsl';
import { Command } from 'commander';
import * as playwright from 'playwright';
import { readFileSync } from 'fs';
const browserType = 'chromium'

export const run = async (aroundHook: (runSteps: (suiteParams: any) => void, environment: string, suiteParams: any) => void = () => {}) => {
    const program = new Command;
    let argSuiteParams = {};
    program
        .command("run [file]")
        .option('-s, --suite-params <params>')
        .option('-e, --environment <params>', 'e.g. production', 'development')
        .description("Run the tests")
        .action(async (file, options) => {
            if (options.suiteParams) {
                const parsedSuiteParams = JSON.parse(options.suiteParams);
                argSuiteParams = {...argSuiteParams, ...parsedSuiteParams};
            }

            if (file) {
                // Clear existing journeys since we'll go from scratch
                state.journeys = [];
                const script = readFileSync(file, {encoding: 'utf8'});
                const scriptFn = new Function('journey', 'step', 'suiteParams', 'console', script);
                scriptFn.apply(null, [journey, step, argSuiteParams, console])
            }

            console.log("Running...", file)

            aroundHook((suiteParams) => runSteps(suiteParams), options.environment, argSuiteParams)
        })

    program.parse()
}

const runSteps = async (suiteParams: any) => {
    console.debug("Running with suite params", suiteParams);
    const browser = await playwright[browserType].launch({ headless: false });
    const context = await browser.newContext()
    const page = await context.newPage()
    console.log(`Found ${state.journeys.length} journeys`)
    for (let i = 0; i < state.journeys.length; i++) {
        const journey = state.currentJourney = state.journeys[i]
        console.log(`Journey: ${journey.options.name}`)
        state.currentJourney.callback(page, context,  browser)
        for (let j = 0; j < journey.steps.length; j++) {
            const step = journey.steps[j]
            console.log(`Step: ${step.name}`)
            await step.callback(suiteParams)
        }
    }

    await browser.close()
}
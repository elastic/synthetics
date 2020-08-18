import * as playwright from 'playwright';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { createInterface as createReadlineInterface } from 'readline';
import { state, journey, step } from './dsl';
import JSONReporter from './reporters/json';

const browserType = 'chromium';
/**
 * TODO Make runner extend Eventemitter and emit all
 * events as we perform actions to use it both
 * in logger and reporter
 */
const runner = new EventEmitter();

export const runJourneys = async (suiteParams: any) => {
    const reporter = new JSONReporter(runner);
    runner.emit('start', suiteParams);
    const browser = await playwright[browserType].launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log(`Found ${state.journeys.length} journeys`);

    for (let i = 0; i < state.journeys.length; i++) {
        const journey = (state.currentJourney = state.journeys[i]);
        runner.emit('journey', journey);
        for (let j = 0; j < journey.steps.length; j++) {
            const step = journey.steps[j];
            runner.emit('step', journey.options.name, step);
            await step.callback(page, suiteParams, { context, browser });
        }
    }
    runner.emit('end');
    await browser.close();
};

export const run = async (
    aroundHook: (
        runSteps: (suiteParams: any) => void,
        environment: string,
        suiteParams: any
    ) => void = r => {
        r({});
    }
) => {
    const program = new Command();
    let argSuiteParams = {};
    program
        .command('run [file]')
        .option('-s, --suite-params <jsonstring>')
        .option('-e, --environment <envname>', 'e.g. production', 'development')
        .option('-j, --json', 'output newline delimited JSON')
        .option('--stdin', 'read script file input from stdin')
        .description('Run the tests')
        .action(async (file, options) => {
            if (options.suiteParams) {
                const parsedSuiteParams = JSON.parse(options.suiteParams);
                console.log('SPARAMS', parsedSuiteParams);
                argSuiteParams = { ...argSuiteParams, ...parsedSuiteParams };
            }

            const singleMode = options.stdin || file;
            if (singleMode) {
                state.reset();
                const source = options.stdin
                    ? await readStdin()
                    : readFileSync(file, { encoding: 'utf8' });
                console.log('Running single script...', source);
                loadInlineScript(source, argSuiteParams);
            }

            console.log('Running...');

            aroundHook(
                suiteParams => runJourneys(suiteParams),
                options.environment,
                argSuiteParams
            );
        });

    program.parse(process.argv);
};

const readStdin = async (): Promise<string> => {
    let source = '';
    const rl = createReadlineInterface({ input: process.stdin });
    rl.on('line', line => {
        source += line + '\n';
    });

    return new Promise<string>(resolve => {
        rl.on('close', () => {
            resolve(source);
        });
    });
};

const loadInlineScript = (source, argSuiteParams) => {
    const scriptFn = new Function('step', 'suiteParams', 'console', source);
    journey('inline', async () => {
        console.log('MAKING STEPS');
        scriptFn.apply(null, [step, argSuiteParams, console]);
    });
    console.log('r STEPS');
};

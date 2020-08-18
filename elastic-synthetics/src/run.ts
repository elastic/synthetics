#!/usr/bin/env node

require('source-map-support').install();
import { runJourneys } from './runner'
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { journey, step, state } from './dsl';
import { createInterface as createReadlineInterface } from 'readline'

export const run = async (aroundHook: (runSteps: (suiteParams: any) => void, environment: string, suiteParams: any) => void = (r) => { r({}) }) => {
    const program = new Command;
    let argSuiteParams = {};
    program
        .command("run [file]")
        .option('-s, --suite-params <jsonstring>')
        .option('-e, --environment <envname>', 'e.g. production', 'development')
        .option('-j, --json', 'output newline delimited JSON')
        .option('--stdin', 'read script file input from stdin')
        .description("Run the tests")
        .action(async (file, options) => {
            if (options.suiteParams) {
                const parsedSuiteParams = JSON.parse(options.suiteParams);
                argSuiteParams = {...argSuiteParams, ...parsedSuiteParams};
            }

            const singleMode = options.stdin || file;
            if (singleMode) {
                state.reset()
                const source = options.stdin ? await readStdin() : readFileSync(file, {encoding: 'utf8'});
                console.log("Running single script...", source)
                loadInlineScript(source, argSuiteParams);
            }

            console.log("Running...")

            aroundHook((suiteParams) => runJourneys(suiteParams), options.environment, argSuiteParams)
        })

    program.parse()
}

const readStdin = async (): Promise<string> => {
    let source = "";
    const rl = createReadlineInterface({input: process.stdin})
    rl.on('line', (line) => {
        source += line + "\n";
    });

    return new Promise<string>((resolve) => {
        rl.on('close', () => {
            resolve(source)
        })
    });
}

const loadInlineScript = (source, argSuiteParams) => {
    const scriptFn = new Function('step', 'suiteParams', 'console', source);
    journey('inline', async () => {
        console.log("MAKING STEPS")
        scriptFn.apply(null, [step, argSuiteParams, console])
    })
    console.log("r STEPS")
}

run()
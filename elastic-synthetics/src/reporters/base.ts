import SonicBoom from 'sonic-boom';
import Runner from '../dsl/runner';
import { Writable } from 'stream';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';

type ReporterOptions = {
    fd?: Writable;
    colors?: boolean;
};

export default class BaseReporter {
    stream: Writable
    constructor(
        public runner: Runner,
        public options: ReporterOptions = {}
    ) {
        this.runner = runner;
        this.stream = new SonicBoom({ fd: options.fd || process.stdout.fd });
        /**
         * Destroy stream once data is written and run
         * it as the last listener giving enough room for
         * other reporters to write to stream
         */
        this.runner.on('end', () => {
            process.nextTick(() => this.stream.end())
        });

        this._registerListeners();
    }

    _registerListeners() {
        this.runner.on('start', ({numJourneys}) => {
            this.write(`Found ${numJourneys} journeys`)
        });

        this.runner.on('journeyStart', ({journey, params}) => {
            this.write(`Journey: ${journey.options.name}`)
        });

        this.runner.on('stepStart', ({journey, step}) => {
            this.write(`Step '${step.name}' starting...`)
        });

        this.runner.on('stepEnd', ({step, elapsedMs, error}) => {
            if (error) {
                this.write(`Step '${step.name}' failed in ${elapsedMs} with error: ${error}`)
            } else {
                this.write(`Step '${step.name}' succeeded in ${elapsedMs}ms`)
            }
        });

        this.runner.on('end', () => {
            this.write('Run completed')
        })
    }

    write(message) {
        this.stream.write(JSON.stringify(message) + '\n');
    }
}

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
        this.runner.on('start', length => {
            this.write(`Found ${length} journeys`)
        });

        this.runner.on('journey', (journey: Journey, params: {[key: string]: any} ) => {
            this.write(`Journey: ${journey.options.name}`)
        });

        this.runner.on('step', (journey: Journey, step: Step) => {
            this.write(`Step: ${step.name}`)
        });

        this.runner.on('end', () => {
            this.write('Run completed')
        })
    }

    write(message) {
        this.stream.write(JSON.stringify(message) + '\n');
    }
}

import { EventEmitter } from 'events';
import { Writable } from 'stream';

type ReporterOptions = {
    stream?: Writable;
    colors?: boolean;
};

export default class JSONReporter {
    stream: Writable;
    constructor(
        public runner: EventEmitter,
        public options: ReporterOptions = {}
    ) {
        this.runner = runner;
        this.stream = options.stream || process.stdout;
        this._registerListeners();
    }

    _registerListeners() {
        const output = {
            meta: {},
            journey: []
        };
        this.runner.on('start', params => {
            output.meta.params = params;
            console.debug('Running with suite params', params);
        });

        this.runner.on('journey', journey => {
            console.log(`Journey: ${journey.options.name}`);
        });

        this.runner.on('step', (journeyName, step) => {
            console.log(`Step: ${step.name}`);
        });

        this.runner.on('end', () => {
            console.log('Its done');
        });
    }

    getOutput() {}
}

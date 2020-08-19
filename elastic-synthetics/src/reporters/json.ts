import { EventEmitter } from 'events';
import { Writable } from 'stream';
import SonicBoom from 'sonic-boom';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import { debug } from '../helpers'

type ReporterOptions = {
    fd?: Writable;
    colors?: boolean;
};

export default class JSONReporter {
    stream: Writable;
    constructor(
        public runner: EventEmitter,
        public options: ReporterOptions = {}
    ) {
        this.runner = runner;
        this.stream = new SonicBoom({ fd: options.fd || process.stdout.fd });
        this._registerListeners();
    }

    _registerListeners() {
        this.runner.on('start', length => {
            debug(`Found ${length} journeys`)
        });

        this.runner.on('journey', (journey: Journey, params: {[key: string]: any} ) => {
            debug(`Journey: ${journey.options.name}`)
            this.write({
              journey: {
                name: journey.options.name,
                id: journey.options.id,
                steps_count: journey.steps.length
              },
              meta: params
            })
        });

        this.runner.on('step', (journey: Journey, step: Step) => {
            debug(`Step: ${step.name}`)
            this.write({
                step: {
                    name: step.name,
                    source: step.callback.toString(),
                    journey: {
                        name: journey.options.name,
                        id: journey.options.id
                    }
                }
            })
        });

        this.runner.on('end', () => {
            debug('Run completed')
            this.stream.end()
        });
    }

    write(message) {
      this.stream.write(JSON.stringify(message) + '\n')
    }

}

import BaseReporter from './base';
import { Journey } from '../dsl/journey';
import { Step } from '../dsl/step';
import Runner from '../dsl/runner';

export default class JSONReporter extends BaseReporter {
    _registerListeners() {
        this.runner.on('journey', (journey: Journey, params: {[key: string]: any} ) => {
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
    }

    write(message) {
      this.stream.write(JSON.stringify(message) + '\n')
    }

}

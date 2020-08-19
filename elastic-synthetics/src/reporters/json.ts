import BaseReporter from './base';
import { Journey, JourneyOptions } from '../dsl/journey';
import { Step } from '../dsl/step';
import Runner from '../dsl/runner';

export default class JSONReporter extends BaseReporter {
    _registerListeners() {
        const journeyMap = new Map();
        this.runner.on(
            'journey',
            (journey: Journey, params: { [key: string]: any }) => {
                const { id, name } = journey.options;
                if (!journeyMap.has(name)) {
                    journeyMap.set(name, {
                        id,
                        name,
                        meta: params,
                        steps: []
                    });
                }
            }
        );

        this.runner.on('step', (journey: Journey, step: Step) => {
            const journeyOutput = journeyMap.get(journey.options.name);
            journeyOutput &&
                journeyOutput.steps.push({
                    name: step.name,
                    source: step.callback.toString()
                });
        });

        this.runner.on('end', () => {
            this.write(this._getOutput(journeyMap));
        });
    }

    _getOutput(journeyMap) {
        const output = { journeys: [] };
        for (const journey of journeyMap.values()) {
            output.journeys.push(journey);
        }
        return output;
    }
}

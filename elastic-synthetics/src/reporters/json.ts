import BaseReporter from './base';

interface JourneyResults {
    id: string,
    name: string,
    meta: {[key: string]: any},
    elapsed: number,
    steps: Array<{
        name: string,
        source: string,
        elapsed: number,
        error: Error,
    }>
}

export default class JSONReporter extends BaseReporter {
    _registerListeners() {
        const journeyMap = new Map<String, JourneyResults>();
        this.runner.on(
            'journeyStart',
            ({journey, params}) => {
            console.log("GOT JOURNEY START")
                const { id, name } = journey.options;
                if (!journeyMap.has(name)) {
                    journeyMap.set(name, {
                        id,
                        name,
                        elapsed: -1,
                        meta: params,
                        steps: []
                    });
                }
            }
        );

        this.runner.on('stepEnd', ({journey, step, elapsed, error}) => {
            console.log("GOT STEP END")
            const journeyOutput = journeyMap.get(journey.options.name);
            journeyOutput &&
                journeyOutput.steps.push({
                    name: step.name,
                    source: step.callback.toString(),
                    elapsed,
                    error,
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

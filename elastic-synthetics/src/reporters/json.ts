import BaseReporter from './base';

interface JourneyResults {
    id: string,
    name: string,
    meta: {[key: string]: any},
    elapsedMs: number,
    steps: Array<{
        name: string,
        source: string,
        elapsedMs: number,
        error: Error,
    }>
}

export default class JSONReporter extends BaseReporter {
    _registerListeners() {
        const journeyMap = new Map<String, JourneyResults>();
        this.runner.on(
            'journeyStart',
            ({journey, params}) => {
                const { id, name } = journey.options;
                if (!journeyMap.has(name)) {
                    journeyMap.set(name, {
                        id,
                        name,
                        elapsedMs: -1, // gets set at the end
                        meta: params,
                        steps: []
                    });
                }
            }
        );

        this.runner.on('journeyEnd', ({journey, elapsedMs }) => {
            journeyMap.get(journey.options.name).elapsedMs = elapsedMs;
        })

        this.runner.on('stepEnd', ({journey, step, elapsedMs, error}) => {
            const journeyOutput = journeyMap.get(journey.options.name);
            journeyOutput &&
                journeyOutput.steps.push({
                    name: step.name,
                    source: step.callback.toString(),
                    elapsedMs,
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

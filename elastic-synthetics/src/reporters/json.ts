import BaseReporter from './base';

interface JourneyResults {
    id: string;
    name: string;
    meta: { [key: string]: any };
    elapsed_ms: number;
    steps: Array<{
        name: string;
        source: string;
        elapsed_ms: number;
        error: Error;
        screenshot: string;
    }>;
}

export default class JSONReporter extends BaseReporter {
    _registerListeners() {
        const journeyMap = new Map<String, JourneyResults>();
        this.runner.on('journey:start', ({ journey, params }) => {
            const { id, name } = journey.options;
            if (!journeyMap.has(name)) {
                journeyMap.set(name, {
                    id,
                    name,
                    elapsed_ms: -1, // gets set at the end
                    meta: params,
                    steps: []
                });
            }
        });

        this.runner.on('journey:end', ({ journey, elapsedMs }) => {
            journeyMap.get(journey.options.name).elapsed_ms = elapsedMs;
        });

        this.runner.on(
            'step:end',
            ({ journey, step, elapsedMs, error, screenshot }) => {
                const journeyOutput = journeyMap.get(journey.options.name);
                journeyOutput &&
                    journeyOutput.steps.push({
                        name: step.name,
                        source: step.callback.toString(),
                        elapsed_ms: elapsedMs,
                        error,
                        screenshot
                    });
            }
        );

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

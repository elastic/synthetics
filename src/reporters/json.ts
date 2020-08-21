import BaseReporter from './base';

// Semver version for the JSON emitted from this package.
const jsonFormatVersion = "1.0.0";

interface JourneyResults {
  id: string;
  name: string;
  meta: { [key: string]: any };
  elapsed_ms: number;
  url?: string; // URL at end of first step
  error?: Error,
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
    const journeyMap = new Map<string, JourneyResults>();
    this.runner.on('journey:start', ({ journey, params }) => {
      const { id, name } = journey.options;
      if (!journeyMap.has(name)) {
        journeyMap.set(name, {
          id,
          name,
          meta: params,
          steps: [],
          elapsed_ms: 0,
        });
      }
    });

    this.runner.on('journey:end', ({ journey, elapsedMs }) => {
      journeyMap.get(journey.options.name).elapsed_ms = elapsedMs;
    });

    this.runner.on(
      'step:end',
      ({ journey, step, elapsedMs, error, screenshot, url }) => {
        const journeyOutput = journeyMap.get(journey.options.name);

        if (!journeyOutput.url) {
          journeyOutput.url = url
        }

        if (error) {
          journeyOutput.error = error
        }

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
    const output = { 
      "__type__": "synthetics-summary-results",
      format_version: jsonFormatVersion,
      journeys: []
    };
    for (const journey of journeyMap.values()) {
      output.journeys.push(journey);
    }
    return output;
  }
}

import BaseReporter from './base';
import { StatusValue } from '../common_types';
import { formatError } from '../helpers';

// Semver version for the JSON emitted from this package.
const jsonFormatVersion = '1.0.0';

interface JourneyResults {
  id: string;
  name: string;
  meta: { [key: string]: any };
  duration_ms: number;
  url?: string; // URL at end of first step
  error?: Error;
  status: StatusValue;
  steps: Array<{
    name: string;
    source: string;
    duration_ms: number;
    error: Error;
    screenshot: string;
    status: StatusValue;
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
          duration_ms: 0,
          status: 'succeeded'
        });
      }
    });

    this.runner.on('journey:end', ({ journey, durationMs }) => {
      const journeyOutput = journeyMap.get(journey.options.name);
      journeyOutput.duration_ms = durationMs;
    });

    this.runner.on(
      'step:end',
      ({ journey, step, durationMs, error, screenshot, url, status }) => {
        const journeyOutput = journeyMap.get(journey.options.name);

        // The URL of the journey is the first URL we see
        if (!journeyOutput.url) {
          journeyOutput.url = url;
        }

        // If there's an error we hoist it up to the journey for convenience
        // and set the status to down
        if (error) {
          journeyOutput.error = formatError(error);
          journeyOutput.status = 'failed';
        }

        journeyOutput &&
          journeyOutput.steps.push({
            name: step.name,
            source: step.callback.toString(),
            duration_ms: durationMs,
            error: formatError(error),
            screenshot,
            status
          });
      }
    );

    this.runner.on('end', () => {
      this.write(this._getOutput(journeyMap));
    });
  }

  _getOutput(journeyMap) {
    const output = {
      __type__: 'synthetics-summary-results',
      format_version: jsonFormatVersion,
      journeys: []
    };
    for (const journey of journeyMap.values()) {
      output.journeys.push(journey);
    }
    return output;
  }
}

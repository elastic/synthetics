import BaseReporter from './base';
import { StatusValue, FilmStrip, NetworkInfo } from '../common_types';
import { formatError } from '../helpers';
import { Journey } from '../dsl/journey';
import snakeCaseKeys from 'snakecase-keys';

// we need this ugly require to get the program version
/* eslint-disable @typescript-eslint/no-var-requires */
const programVersion = require('../../package.json').version;

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
  filmstrips?: Array<FilmStrip>;
  networkinfo?: Array<NetworkInfo>;
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
    let journeyStatus: 'succeeded' | 'failed' = 'succeeded';
    let journeyError: Error;

    this.runner.on('journey:start', ({ journey, params }) => {
      this.writeJSON('journey:start', journey, {
        params,
        source: journey.callback.toString(),
      });
    });

    this.runner.on(
      'step:end',
      ({ journey, step, durationMs, error, screenshot, url, status }) => {
        if (screenshot) {
          this.writeJSON('step:screenshot', journey, { screenshot });
        }
        this.writeJSON('step:end', journey, {
          name: step.name,
          index: step.index,
          source: step.callback.toString(),
          duration_ms: durationMs,
          error: formatError(error),
          url,
          status,
        });

        if (status === 'failed') {
          journeyStatus = 'failed';
          journeyError = error;
        }
      }
    );

    this.runner.on(
      'journey:end',
      ({ journey, durationMs, filmstrips, networkinfo }) => {
        if (networkinfo) {
          // TODO: there can easily be hundreds of network reqs per page
          // Should we keep this in one big event? Could result in large ES doc sizes
          this.writeJSON(
            'journey:network_info',
            journey,
            snakeCaseKeys(networkinfo)
          );
        }
        if (filmstrips) {
          // Write each filmstrip separately so that we don't get documents that are too large
          filmstrips.forEach((strip, index) => {
            this.writeJSON('journey:filmstrips', journey, {
              index,
              ...snakeCaseKeys(strip),
            });
          });
        }
        this.writeJSON('journey:end', journey, {
          duration_ms: durationMs,
          error: formatError(journeyError),
          status: journeyStatus,
        });
      }
    );
  }

  writeJSON(type: string, journey: Journey, payload: any) {
    this.write({
      __type__: type,
      // It may seem redundant including this info in each line but it might make debugging individual JSON
      // fragments easier in the future
      'elastic-synthetics-version': programVersion,
      format_version: jsonFormatVersion,
      journey: {
        name: journey.options.name,
        id: journey.options.id,
      },
      '@timestamp': new Date(), // TODO: Use monotonic clock?
      payload,
    });
  }
}

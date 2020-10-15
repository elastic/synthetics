import BaseReporter from './base';
import { formatError, getTimestamp } from '../helpers';
import { Journey, Step } from '../dsl';
import snakeCaseKeys from 'snakecase-keys';

// we need this ugly require to get the program version
/* eslint-disable @typescript-eslint/no-var-requires */
const programVersion = require('../../package.json').version;

export default class JSONReporter extends BaseReporter {
  _registerListeners() {
    this.runner.on('journey:register', ({ journey }) => {
      this.writeJSON('journey/register', journey, {});
    });

    this.runner.on('journey:start', ({ journey, timestamp, params }) => {
      this.writeJSON('journey/start', journey, {
        timestamp,
        payload: { params, source: journey.callback.toString },
      });
    });

    this.runner.on(
      'step:end',
      ({
        journey,
        step,
        timestamp,
        start,
        end,
        error,
        screenshot,
        url,
        status,
        metrics,
      }) => {
        if (screenshot) {
          this.writeJSON('step/screenshot', journey, {
            step,
            blob: screenshot,
          });
        }
        this.writeJSON('step/end', journey, {
          step,
          timestamp,
          url,
          error,
          payload: {
            source: step.callback.toString(),
            start,
            end,
            url,
            status,
            metrics,
          },
        });
      }
    );

    this.runner.on(
      'journey:end',
      ({
        journey,
        timestamp,
        start,
        end,
        filmstrips,
        networkinfo,
        status,
        error,
      }) => {
        if (networkinfo) {
          networkinfo.forEach(ni => {
            this.writeJSON('journey/network_info', journey, {
              payload: snakeCaseKeys(ni),
            });
          });
        }
        if (filmstrips) {
          // Write each filmstrip separately so that we don't get documents that are too large
          filmstrips.forEach((strip, index) => {
            this.writeJSON('journey/filmstrips', journey, {
              payload: {
                index,
                ...{
                  name: strip.name,
                  ts: strip.ts,
                },
              },
              blob: strip.snapshot,
            });
          });
        }
        this.writeJSON('journey/end', journey, {
          timestamp,
          error,
          payload: {
            start,
            end,
            status,
          },
        });
      }
    );
  }

  // Writes a structered synthetics event
  // Note that blob is ultimately stored in ES as a base64 encoded string. You must base 64 encode
  // it before passing it into this function!
  // The payload field is an un-indexed field with no ES mapping, so users can put arbitary structured
  // stuff in there
  writeJSON(
    type: string,
    journey: Journey,
    {
      timestamp,
      step,
      error,
      payload,
      blob,
      url,
    }: {
      timestamp?: number;
      url?: string;
      step?: Step;
      error?: Error;
      payload?: { [key: string]: any };
      blob?: string;
    }
  ) {
    this.write({
      type,
      '@timestamp': timestamp || getTimestamp(),
      journey: {
        name: journey.name,
        id: journey.id,
      },
      step: step
        ? {
            name: step.name,
            index: step.index,
          }
        : undefined,
      payload,
      blob,
      error: formatError(error),
      url,
      package_version: programVersion,
    });
  }
}

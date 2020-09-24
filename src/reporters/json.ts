import BaseReporter from './base';
import { StatusValue } from '../common_types';
import { formatError, getTimestamp } from '../helpers';
import { Journey } from '../dsl/journey';
import snakeCaseKeys from 'snakecase-keys';
import { Step } from '../dsl/step';

// we need this ugly require to get the program version
/* eslint-disable @typescript-eslint/no-var-requires */
const programVersion = require('../../package.json').version;

export default class JSONReporter extends BaseReporter {
  _registerListeners() {
    let journeyStatus: StatusValue = 'succeeded';
    let journeyError: Error;

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
        durationMs,
        error,
        screenshot,
        screenshotMime,
        url,
        status,
        metrics,
      }) => {
        if (screenshot) {
          this.writeJSON('step/screenshot', journey, {
            step,
            blob: screenshot,
            blobMime: screenshotMime,
          });
        }
        this.writeJSON('step/end', journey, {
          step,
          timestamp,
          error,
          url,
          payload: {
            source: step.callback.toString(),
            duration_ms: durationMs,
            error: formatError(error),
            url,
            status,
            metrics,
          },
        });

        if (status === 'failed') {
          journeyStatus = 'failed';
          journeyError = error;
        }
      }
    );

    this.runner.on(
      'journey:end',
      ({ journey, timestamp, durationMs, filmstrips, networkinfo }) => {
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
          payload: {
            duration_ms: durationMs,
            error: formatError(journeyError),
            status: journeyStatus,
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
      blobMime,
      url,
    }: {
      timestamp?: number;
      url?: string;
      step?: Step;
      error?: Error;
      payload?: { [key: string]: any };
      blob?: string;
      blobMime?: string;
    }
  ) {
    this.write({
      type,
      '@timestamp': timestamp || getTimestamp(),
      journey: {
        name: journey.options.name,
        id: journey.options.id,
      },
      step: step
        ? {
            name: step.name,
            index: step.index,
          }
        : undefined,
      payload,
      blob,
      blob_mime: blobMime,
      error: formatError(error),
      url,
      package_version: programVersion,
    });
  }
}

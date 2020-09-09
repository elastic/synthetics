import { run } from '../index';
import { runner } from '../dsl';
import * as ParseArgs from '../parse_args';

describe('top-level function', () => {
  let runnerSpy: jest.SpyInstance;

  beforeEach(() => {
    runnerSpy = jest.spyOn(runner, 'run');
  });

  it('uses undefined options when none specified', () => {
    run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "dryRun": undefined,
        "environment": "debug",
        "headless": false,
        "journeyName": undefined,
        "network": undefined,
        "params": Object {},
        "pauseOnError": undefined,
        "screenshots": undefined,
      }
    `);
  });

  it('uses specified option values', () => {
    run({
      params: {},
      environment: 'debug',
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true
    });
    expect(runnerSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "dryRun": true,
        "environment": "debug",
        "headless": true,
        "journeyName": "There and Back Again",
        "network": true,
        "params": Object {},
        "pauseOnError": true,
        "screenshots": true,
      }
    `);
  });

  it('uses cli args if no option specified', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ParseArgs.cliArgs = {
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true
    };
    run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "dryRun": true,
        "environment": "debug",
        "headless": true,
        "journeyName": "There and Back Again",
        "network": true,
        "params": Object {},
        "pauseOnError": true,
        "screenshots": true,
      }
    `);
  });
});

import { run } from '../index';
import { runner } from '../dsl';
import * as ParseArgs from '../parse_args';

describe('run', () => {
  let runnerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(ParseArgs, 'parseArgs').mockImplementation(() => {
      return ParseArgs._program;
    });
    runnerSpy = jest.spyOn(runner, 'run');
  });

  it('uses undefined options when none specified', async () => {
    await run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      "dryRun": undefined,
      environment: "debug",
      "headless": false,
      journeyName: undefined,
      network: undefined,
      params: {},
      pauseOnError: undefined,
      screenshots: undefined
    });
  });

  it('uses specified option values', async () => {
    const runParams = {
      params: {},
      environment: 'debug',
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true,
    };
    await run(runParams);
    expect(runnerSpy.mock.calls[0][0]).toEqual(runParams);
  });

  it('uses cli args if no option specified', async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore reassigning a readonly field, but for testing purposes
    ParseArgs.cliArgs = {
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true,
    };
    const runParams = { params: {}, environment: 'debug' };
    await run(runParams);
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      dryRun: undefined,
      environment: 'debug',
      headless: false,
      journeyName: undefined,
      network: undefined,
      params: {},
      pauseOnError: undefined,
      screenshots: undefined,
    });
  });
});

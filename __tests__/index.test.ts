import { run } from '../src/index';
import { runner } from '../src/dsl';
import * as ParseArgs from '../src/parse_args';

describe('run', () => {
  let runnerSpy: jest.SpyInstance;
  let parseArgsSpy: jest.SpyInstance;

  beforeEach(() => {
    runnerSpy = jest
      .spyOn(runner, 'run')
      .mockImplementation(() => Promise.resolve());
    parseArgsSpy = jest.spyOn(ParseArgs, 'parseArgs');
  });

  it('uses undefined options when none specified', async () => {
    parseArgsSpy.mockImplementation(() => ({}));
    await run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      dryRun: undefined,
      environment: 'debug',
      headless: undefined,
      journeyName: undefined,
      network: undefined,
      params: {},
      pauseOnError: undefined,
      screenshots: undefined,
      outfd: undefined,
      reporter: undefined,
    });
  });

  it('uses specified option values', async () => {
    const reporter: 'default' | 'json' = 'json';
    const runParams = {
      params: {},
      environment: 'debug',
      headless: true,
      screenshots: true,
      dryRun: true,
      journeyName: 'There and Back Again',
      network: true,
      pauseOnError: true,
      outfd: undefined,
      reporter,
    };
    await run(runParams);
    expect(runnerSpy.mock.calls[0][0]).toEqual(runParams);
  });

  it('uses cli args if some options are not specified', async () => {
    parseArgsSpy.mockImplementation(() => {
      return {
        headless: true,
        screenshots: true,
        dryRun: true,
        journeyName: 'There and Back Again',
        network: true,
        pauseOnError: true,
        reporter: undefined,
        outfd: undefined,
      } as any;
    });

    await run({ params: {}, environment: 'debug' });
    expect(runnerSpy.mock.calls[0][0]).toEqual({
      dryRun: true,
      environment: 'debug',
      headless: true,
      journeyName: 'There and Back Again',
      network: true,
      params: {},
      pauseOnError: true,
      screenshots: true,
      reporter: undefined,
      outfd: undefined,
    });
  });
});

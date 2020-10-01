import fs from 'fs';
import { runner, step, journey } from '../../src/core';
import JSONReporter from '../../src/reporters/json';
import { formatError, generateTempPath } from '../../src/helpers';
import { Journey } from '../../src/dsl';

describe('json reporter', () => {
  let dest: string;
  let j1: Journey;
  let stream;

  beforeEach(() => {
    dest = generateTempPath();
    stream = new JSONReporter(runner, { fd: fs.openSync(dest, 'w') }).stream;
    jest.useFakeTimers('modern').setSystemTime(new Date('2020-09-17'));
    j1 = journey('j1', () => {});
  });

  afterEach(() => {
    fs.unlinkSync(dest);
  });

  const readAndCloseStream = async () => {
    /**
     * Close the underyling stream writing to FD to read all the contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd, 'utf-8');
    return buffer;
  };

  it('writes each step as NDJSON to the FD', async () => {
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp: 1600300800000000,
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'succeeded',
      step: step('s1', async () => {}),
      screenshot: 'dummy',
      url: 'dummy',
      timestamp: 1600300800000000,
      start: 0,
      end: 10,
    });
    runner.emit('journey:end', {
      journey: j1,
      params: {},
      status: 'succeeded',
      start: 0,
      end: 10,
      timestamp: 1600300800000000,
      filmstrips: [
        {
          snapshot: 'dummy',
          name: 'screenshot',
          ts: 1,
        },
      ],
      networkinfo: [
        {
          request: {},
          response: {},
          isNavigationRequest: true,
        } as any,
      ],
    });
    runner.emit('end', 'done');

    expect((await readAndCloseStream()).toString()).toMatchSnapshot();
  });

  it('writes errors to the top level', async () => {
    const myErr = new Error('myError');

    runner.emit('step:end', {
      journey: j1,
      status: 'failed',
      step: step('s2', async () => {}),
      screenshot: 'dummy2',
      url: 'dummy2',
      timestamp: 1600300800000001,
      start: 11,
      end: 20,
      error: myErr,
    });

    const buffer = await readAndCloseStream();
    let error: any;
    buffer.split('\n').forEach(l => {
      try {
        const parsed = JSON.parse(l);
        if (parsed.type == 'step/end') {
          error = parsed.error;
        }
      } catch (e) {
        return; // ignore empty lines
      }
    });
    expect(error).toEqual(formatError(myErr));
  });
});

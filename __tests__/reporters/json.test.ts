import fs from 'fs';
import { runner, step, journey } from '../../src/dsl';
import JSONReporter from '../../src/reporters/json';
import { generateTempPath } from '../../src/helpers';

describe('json reporter', () => {
  const dest = generateTempPath();
  afterAll(() => {
    fs.unlinkSync(dest);
  });

  it('writes each step as NDJSON to the FD', async () => {
    const { stream } = new JSONReporter(runner, { fd: fs.openSync(dest, 'w') });
    jest.useFakeTimers('modern').setSystemTime(new Date('2020-09-17'));
    const j1 = journey('j1', () => {});
    runner.emit('journey:start', {
      journey: j1,
      params: {},
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'succeeded',
      step: step('s1', async () => {}),
      durationMs: 10,
      screenshot: 'dummy',
      url: 'dummy',
    });
    runner.emit('journey:end', {
      journey: j1,
      params: {},
      durationMs: 11,
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

    /**
     * Close the underyling stream writing to FD to read all the contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd, 'utf-8');
    expect(buffer.toString()).toMatchSnapshot();
  });
});

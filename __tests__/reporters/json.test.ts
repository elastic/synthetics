import fs from 'fs';
import { runner, step, journey } from '../../src/core';
import JSONReporter from '../../src/reporters/json';
import * as helpers from '../../src/helpers';

describe('json reporter', () => {
  const dest = helpers.generateTempPath();
  afterAll(() => {
    fs.unlinkSync(dest);
  });

  it('writes each step as NDJSON to the FD', async () => {
    const timestamp = 1600300800000000;
    const { stream } = new JSONReporter(runner, { fd: fs.openSync(dest, 'w') });
    jest.spyOn(helpers, 'getTimestamp').mockImplementation(() => timestamp);

    const j1 = journey('j1', () => {});
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp,
    });
    runner.emit('step:end', {
      journey: j1,
      status: 'succeeded',
      step: step('s1', async () => {}),
      screenshot: 'dummy',
      url: 'dummy',
      timestamp,
      start: 0,
      end: 10,
    });
    runner.emit('journey:end', {
      journey: j1,
      params: {},
      status: 'succeeded',
      start: 0,
      end: 11,
      timestamp,
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

/**
 * Disable the ANSI codes for kleur/colors module
 */
process.env.NO_COLOR = '1';

import fs from 'fs';
import { runner, step, journey } from '../../src/core';
import BaseReporter from '../../src/reporters/base';
import * as helpers from '../../src/helpers';

describe('base reporter', () => {
  const dest = helpers.generateTempPath();
  afterAll(() => {
    fs.unlinkSync(dest);
    process.env.NO_COLOR = '';
  });

  it('writes each step to the FD', async () => {
    const timestamp = 1600300800000000;
    jest.spyOn(helpers, 'now').mockImplementation(() => 0);
    const { stream } = new BaseReporter(runner, { fd: fs.openSync(dest, 'w') });
    runner.emit('start', { numJourneys: 1 });
    const j1 = journey('j1', async () => {});
    runner.emit('journey:start', {
      journey: j1,
      params: {},
      timestamp,
    });
    const error = {
      name: 'Error',
      message: 'step failed',
      stack: 'Error: step failed',
    };
    runner.emit('step:end', {
      journey: j1,
      status: 'failed',
      error,
      step: step('s1', async () => {}),
      url: 'dummy',
      start: 0,
      end: 1,
      timestamp,
    });
    runner.emit('end', 'done');
    /**
     * Close the underyling stream writing to FD to read all its contents
     */
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const fd = fs.openSync(dest, 'r');
    const buffer = fs.readFileSync(fd);
    expect(buffer.toString()).toMatchSnapshot();
  });
});

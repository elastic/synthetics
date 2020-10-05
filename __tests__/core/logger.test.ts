import fs from 'fs';
import { log, setLogger } from '../../src/core/logger';
import { generateTempPath } from '../../src/helpers';

describe('Logger', () => {
  const dest = generateTempPath();
  const message = 'wrote something';
  const stream = setLogger(fs.openSync(dest, 'w'));
  afterAll(() => {
    fs.unlinkSync(dest);
  });

  it('log to specified fd', async () => {
    process.env.DEBUG = '1';
    log(message);
    stream.end();
    await new Promise(resolve => stream.once('finish', resolve));
    const buffer = fs.readFileSync(fs.openSync(dest, 'r'), 'utf-8');
    expect(buffer).toContain(message);
  });
});

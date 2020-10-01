import fs from 'fs';
import { log, flushLoggerSync, setLogger } from '../../src/core/logger';
import { generateTempPath } from '../../src/helpers';

describe('Logger', () => {
  const dest = generateTempPath();
  const message = 'wrote something';
  setLogger(fs.openSync(dest, 'w'));
  afterAll(() => {
    fs.unlinkSync(dest);
  });
  it('log to specified fd', async () => {
    process.env.DEBUG = '1';
    log(message);
    await flushLoggerSync();
    const buffer = fs.readFileSync(fs.openSync(dest, 'r'), 'utf-8');
    expect(buffer).toContain(message);
  });
});

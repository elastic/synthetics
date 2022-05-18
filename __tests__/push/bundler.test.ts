/**
 * MIT License
 *
 * Copyright (c) 2020-present, Elastic NV
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

import { createReadStream, createWriteStream, unlinkSync } from 'fs';
import unzipper from 'unzipper';
import { join } from 'path';
import { generateTempPath } from '../../src/helpers';
import { Bundler } from '../../src/push/bundler';

const journeyFile = join(__dirname, '..', 'e2e', 'uptime.journey.ts');

async function validateZip(content) {
  const decoded = Buffer.from(content, 'base64');
  const pathToZip = generateTempPath();
  const writeStr = createWriteStream(pathToZip);
  writeStr.write(decoded);

  const files = [];
  const entries = createReadStream(pathToZip).pipe(
    unzipper.Parse({ forceStream: true })
  );
  for await (const entry of entries) {
    files.push(entry.path);
  }

  expect(files).toEqual(['__tests__/e2e/uptime.journey.ts']);
  unlinkSync(pathToZip);
}

describe('Bundler', () => {
  it('build journey', async () => {
    const bundler = new Bundler();
    const content = await bundler.build(journeyFile, generateTempPath());
    await validateZip(content);
  });
});

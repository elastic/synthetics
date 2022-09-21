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

import { createReadStream } from 'fs';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import unzipper from 'unzipper';
import { join } from 'path';
import { generateTempPath } from '../../src/helpers';
import { Bundler } from '../../src/push/bundler';

const PROJECT_DIR = join(__dirname, 'test-bundler');
const journeyFile = join(PROJECT_DIR, 'bundle.journey.ts');

async function validateZip(content) {
  const partialPath = join(
    '__tests__',
    'push',
    'test-bundler',
    'bundle.journey.ts'
  );
  const decoded = Buffer.from(content, 'base64');
  const pathToZip = generateTempPath();
  await writeFile(pathToZip, decoded);

  const files: Array<string> = [];

  const entries = createReadStream(pathToZip).pipe(
    unzipper.Parse({ forceStream: true })
  );

  let targetFileContent = null;
  for await (const entry of entries) {
    files.push(entry.path);

    if (entry.path === partialPath) {
      entry.on('data', d => (targetFileContent += d));
    }
  }

  expect(files).toEqual([partialPath]);

  expect(targetFileContent).toContain('__toESM');
  expect(targetFileContent).toContain('node_modules/is-positive/index.js');

  await unlink(pathToZip);
}

describe('Bundler', () => {
  const bundler = new Bundler();

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    await writeFile(
      journeyFile,
      `import {journey, step, monitor} from '@elastic/synthetics';
import isPositive from 'is-positive';

journey('journey 1', () => {
  monitor.use({ id: 'duplicate id' })
  step("step1", () => {
    isPositive(-1);
  })
});`
    );
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true });
  });

  it('build journey', async () => {
    const content = await bundler.build(journeyFile, generateTempPath());
    await validateZip(content);
  });

  it('bundle should be idempotent', async () => {
    const content1 = await bundler.build(journeyFile, generateTempPath());
    const content2 = await bundler.build(journeyFile, generateTempPath());
    expect(content1).toEqual(content2);
  });

  it('throw errors on incorrect path', async () => {
    try {
      await bundler.build(join(PROJECT_DIR, 'blah.ts'), generateTempPath());
    } catch (e) {
      expect(e.message).toContain('ENOENT');
    }
  });
});

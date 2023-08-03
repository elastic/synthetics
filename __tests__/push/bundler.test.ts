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

const setup = async () => {
  await writeFile(
    journeyFile,
    `import {journey, step, monitor} from '@elastic/synthetics';
import isPositive from 'is-positive';
import utils from "./utils"
journey('journey 1', () => {
  // include utils to make sure it is bundled and not ignored via
  // dead code elimination while bundling
  utils();
  monitor.use({ id: 'duplicate id' });
  launchStep(-1);
});
const launchStep = (no: number) => {
  step("step1", () => {
    isPositive(no);
  })
};`
  );

  await writeFile(
    join(PROJECT_DIR, 'utils.ts'),
    `import isPositive from 'is-positive';
    export default utils = () => {
      isPositive(1);
    };`
  );
};

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

  let contents = '';
  await new Promise(r => {
    createReadStream(pathToZip)
      .pipe(unzipper.Parse())
      .on('entry', function (entry) {
        files.push(entry.path);
        contents += '\n' + entry.path + '\n';
        entry.on('data', d => (contents += d));
      })
      .on('close', r);
  });

  expect(files).toEqual([partialPath]);

  // Verify if files are bundled together
  expect(contents).toContain('node_modules/is-positive/index.js');
  expect(contents).toContain('test-bundler/bundle.journey.ts');
  expect(contents).toContain('test-bundler/utils.ts');
  // Verify if sourcemaps are present after bundling
  expect(contents).toContain('sourceMappingURL=data:application/json;base64');
  await unlink(pathToZip);
}

describe('Bundler', () => {
  const bundler = new Bundler();

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    await setup();
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true });
  });

  it('build journey', async () => {
    const content = await bundler.build(journeyFile, '', generateTempPath());
    await validateZip(content);
  });

  it('bundle should be idempotent', async () => {
    const content1 = await bundler.build(journeyFile, '', generateTempPath());
    const content2 = await bundler.build(journeyFile, '', generateTempPath());
    expect(content1).toEqual(content2);
  });

  it('throw errors on incorrect path', async () => {
    try {
      await bundler.build(join(PROJECT_DIR, 'blah.ts'), '', generateTempPath());
    } catch (e) {
      expect(e.message).toContain('no such file or directory');
    }
  });
});

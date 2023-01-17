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

import * as esbuild from 'esbuild';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { commonOptions } from '../../src/core/transform';
import { SyntheticsBundlePlugin } from '../../src/push/plugin';

describe('SyntheticsBundlePlugin', () => {
  const PROJECT_DIR = join(__dirname, 'test-bundler');
  const journeyFile = join(PROJECT_DIR, 'bundle.journey.ts');

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true });
  });

  it('skip locally resolved synthetics package', async () => {
    // Should
    await writeFile(
      journeyFile,
      `import {journey, step, monitor} from '../../';
journey('journey 1', () => {
  monitor.use({ id: 'duplicate id' });
  step("step1", () => {})
});`
    );
    const result = await esbuild.build({
      ...commonOptions(),
      bundle: false,
      sourcemap: false,
      write: false,
      entryPoints: [journeyFile],
      plugins: [SyntheticsBundlePlugin()],
    });
    expect(result.outputFiles[0].text).toMatchSnapshot();
  });
});

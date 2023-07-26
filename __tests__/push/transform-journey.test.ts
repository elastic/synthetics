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

import { join } from 'path';
import { transform } from '../../src/push/transform-journey';
import { mkdir, rm, writeFile } from 'fs/promises';

describe('TransformJourneyPlugin', () => {
  const PROJECT_DIR = join(__dirname, 'test-transform');
  const journeyFile = join(PROJECT_DIR, 'transform.journey.ts');

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true });
  });
  it('static journeys', async () => {
    await writeFile(
      journeyFile,
      `import {journey, step, monitor} from '../../';
journey('j1', () => {
monitor.use({ id: 'duplicate id' });
});

function util(){}

journey('j2', () => {});`
    );

    const res1 = await transform(journeyFile, 'j1');
    expect(res1?.code).toMatchSnapshot();
    const res2 = await transform(journeyFile, 'j2');
    expect(res2?.code).toMatchSnapshot();
    const res3 = await transform(journeyFile, '');
    expect(res3?.code).toMatchSnapshot();
  });

  it('dynamic journeys', async () => {
    await writeFile(
      journeyFile,
      `import {journey, step, monitor} from '../../';

journey('j1', () => {});

const createJourney = (name) => {
  journey(name, () => {
    monitor.use({ id: 'duplicate id' });
    step("step1", () => {})
  });
};

createJourney('j2');
`
    );

    const res1 = await transform(journeyFile, 'j1');
    expect(res1?.code).toMatchSnapshot();
    const res2 = await transform(journeyFile, 'j2');
    expect(res2?.code).toMatchSnapshot();
    const res3 = await transform(journeyFile, '');
    expect(res3?.code).toMatchSnapshot();
  });
});

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

import { existsSync, readFileSync } from 'fs';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { CLIMock } from '../utils/test-config';
import { REGULAR_FILES_PATH, CONFIG_PATH } from '../../src/generator';
import { replaceTemplates } from '../../src/generator/utils';

describe('Generator utils', () => {
  it('does not add empty values in array', async () => {
    const template = readFileSync(
      join(__dirname, '../../templates', 'synthetics.config.ts'),
      'utf-8'
    );
    const values = {
      locations: ['us_east'],
      privateLocations: [],
      schedule: 30,
      id: 'test',
      space: 'kbn',
      url: 'foo:bar',
    };
    const finalValue = replaceTemplates(template, values);

    expect(finalValue).toContain("locations: ['us_east'],");
    expect(finalValue).toContain('privateLocations: [],');

    expect(finalValue).not.toContain("['']");
  });
});

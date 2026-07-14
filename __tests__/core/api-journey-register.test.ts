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

import { Gatherer } from '../../src/core/gatherer';
import { apiJourney, runner } from '../../src/core';
import { APIJourney } from '../../src/dsl';

// Keep the Gatherer accessible to silence unused-import warnings.
void Gatherer;

const noop = () => {};

describe('apiJourney() factory', () => {
  afterEach(() => runner._reset());

  it('registers an APIJourney instance with type "api"', () => {
    const j = apiJourney('basic', noop);
    expect(j).toBeInstanceOf(APIJourney);
    expect(j.type).toBe('api');
    expect(runner.journeys).toContain(j);
  });

  it('accepts an options object', () => {
    const j = apiJourney({ name: 'with opts', tags: ['t'] }, noop);
    expect(j.name).toBe('with opts');
    expect(j.tags).toEqual(['t']);
  });

  it('apiJourney.skip marks the journey as skipped', () => {
    const j = apiJourney.skip('skipped', noop);
    expect(j.skip).toBe(true);
    expect(j.only).toBe(false);
  });

  it('apiJourney.only marks the journey as only', () => {
    const j = apiJourney.only('focused', noop);
    expect(j.only).toBe(true);
    expect(j.skip).toBe(false);
  });

  it('exposes the source location', () => {
    const j = apiJourney('with-location', noop);
    expect(j.location).toMatchObject({
      file: expect.stringContaining('api-journey-register.test.ts'),
      line: expect.any(Number),
      column: expect.any(Number),
    });
  });
});

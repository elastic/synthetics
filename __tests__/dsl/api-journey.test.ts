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

import { APIJourney } from '../../src/dsl';

const noop = () => {};

describe('APIJourney', () => {
  it('sets journey type to api', () => {
    const j = new APIJourney({ name: 'api' }, noop);
    expect(j.type).toBe('api');
  });

  it('propagates name, id, and tags through the base journey', () => {
    const j = new APIJourney(
      { name: 'api', id: 'api-id', tags: ['foo'] },
      noop
    );
    expect(j.name).toBe('api');
    expect(j.id).toBe('api-id');
    expect(j.tags).toEqual(['foo']);
  });

  it("defaults monitor type to 'api' (not browser)", () => {
    const j = new APIJourney({ name: 'api' }, noop);
    expect(j.monitor.config.type).toBe('api');
  });

  it('preserves api monitor type across config updates', () => {
    const j = new APIJourney({ name: 'api' }, noop);
    j._updateMonitor({ schedule: 10 });
    expect(j.monitor.config.type).toBe('api');
    expect(j.monitor.config.schedule).toBe(10);
  });

  it('adds steps via inherited base journey API', () => {
    const j = new APIJourney({ name: 'api' }, noop);
    j._addStep('first', noop);
    j._addStep('second', noop);
    expect(j.steps).toHaveLength(2);
    expect(j.steps[0].name).toBe('first');
  });
});

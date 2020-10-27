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

import {
  journey,
  step,
  runner,
  before,
  after,
  beforeAll,
  afterAll,
} from '../../src/core/index';

beforeEach(() => runner.reset());

const noop = async () => {};
const name = 'journey';

it('add global hooks to runner', () => {
  const test1 = () => 40;
  const test2 = () => 42;
  beforeAll(test1);
  afterAll(test1);
  beforeAll(test2);
  afterAll(test2);
  expect(runner.hooks.beforeAll).toEqual([test1, test2]);
  expect(runner.hooks.afterAll).toEqual([test1, test2]);
});

it('add journeys to runner', () => {
  const j = journey(name, noop);

  expect(j.name).toBe(name);
  expect(j.id).toBe(name);
  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
});

it('add steps to journeys', () => {
  const j = journey(name, noop);
  const s1 = step('step1', noop);
  const s2 = step('step2', noop);

  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
  expect(runner.currentJourney.steps.length).toBe(2);
  expect(runner.currentJourney.steps).toEqual([s1, s2]);
});

it('add hooks to journeys', () => {
  const j = journey(name, noop);
  before(noop);
  after(noop);

  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
  expect(runner.currentJourney.steps.length).toBe(0);
  expect(runner.currentJourney.hooks.before).toEqual([noop]);
  expect(runner.currentJourney.hooks.after).toEqual([noop]);
});

it('add hooks - error on before/after outside journey context', () => {
  try {
    before(noop);
  } catch (e) {
    expect(e.message).toBe('before is called outside of the journey context');
  }
});

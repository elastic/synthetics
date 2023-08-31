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

import { journey, step, expect } from '../../';

declare global {
  namespace synthetics {
    interface Matchers<R> {
      toBeWithinRange(a: number, b: number): R;
    }
  }
}

// Declare the global matcher in the PW namesapce to be used in tests
// to satisfy the type checker and IDE
declare global {
  namespace PlaywrightTest {
    interface Matchers<R> {
      toBeWithinRange(a: number, b: number): R;
    }
  }
}

expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

journey('expect extends', ({ page }) => {
  step('exports work', () => {
    expect(100).toBe(100);
    expect([1, 2, 3]).toEqual(expect.arrayContaining([1, 2, 3]));
    expect({ foo: 'bar' }).toMatchObject({ foo: 'bar' });
  });

  step('extends work', () => {
    expect(100).toBeWithinRange(90, 120);
    expect(101).not.toBeWithinRange(0, 100);
  });

  step('pw test methods work', async () => {
    await expect(page).toHaveURL('about:blank');
    await expect(page).toHaveTitle('', { timeout: 100 });
  });
});

journey('expect unsupported', ({ page }) => {
  step('throw unsupported', async () => {
    await expect(page).toHaveScreenshot();
  });
});

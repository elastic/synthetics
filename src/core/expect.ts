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

import type { Locator } from '@playwright/test';
import { expect as playwrightExpect } from '@playwright/test';
import type {
  AsymmetricMatcher,
  MatcherState,
  ExpectedAssertionsErrors,
  Inverse,
  PromiseMatchers,
} from 'expect/build/types';
type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;
type ExtraMatchers<T, Type, Matchers> = T extends Type
  ? Matchers
  : // eslint-disable-next-line @typescript-eslint/ban-types
    IfAny<T, Matchers, {}>;

// Copied source code from expect/build/types.d.ts
export declare type Expect = {
  <T = unknown>(actual: T): synthetics.Matchers<T> &
    ExtraMatchers<T, Locator, synthetics.LocatorAssertions>;
  assertions(arg0: number): void;
  extend(arg0: any): void;
  extractExpectedAssertionsErrors: () => ExpectedAssertionsErrors;
  getState(): MatcherState;
  hasAssertions(): void;
  setState(state: Partial<MatcherState>): void;
  any(expectedObject: any): AsymmetricMatcher;
  anything(): AsymmetricMatcher;
  arrayContaining(sample: Array<unknown>): AsymmetricMatcher;
  objectContaining(sample: Record<string, unknown>): AsymmetricMatcher;
  stringContaining(expected: string): AsymmetricMatcher;
  stringMatching(expected: string | RegExp): AsymmetricMatcher;
};

/**
 * Override matchers from expect in our synthetic namespace to
 * reduce support for spy and snapshot matchers which is
 * impelemed via jest matchers
 *
 * We declare the types in global synthetics namespace which allows
 * users to extend expect functionality without type errors
 */
declare global {
  export namespace synthetics {
    export interface Matchers<R> {
      /**
       * If you know how to test something, `.not` lets you test its opposite.
       */
      not: Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Use resolves to unwrap the value of a fulfilled promise so any other
       * matcher can be chained. If the promise is rejected the assertion fails.
       */
      resolves: Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Unwraps the reason of a rejected promise so any other matcher can be chained.
       * If the promise is fulfilled the assertion fails.
       */
      rejects: Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Checks that a value is what you expect. It uses `===` to check strict equality.
       * Don't use `toBe` with floating-point numbers.
       */
      toBe(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Using exact equality with floating point numbers is a bad idea.
       * Rounding means that intuitive things fail.
       * The default for numDigits is 2.
       */
      toBeCloseTo(
        expected: number,
        numDigits?: number
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Ensure that a variable is not undefined.
       */
      toBeDefined(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * When you don't care what a value is, you just want to
       * ensure a value is false in a boolean context.
       */
      toBeFalsy(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * For comparing floating point numbers.
       */
      toBeGreaterThan(
        expected: number | bigint
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * For comparing floating point numbers.
       */
      toBeGreaterThanOrEqual(
        expected: number | bigint
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Ensure that an object is an instance of a class.
       * This matcher uses `instanceof` underneath.
       */
      /* eslint-disable-next-line */
      toBeInstanceOf(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * For comparing floating point numbers.
       */
      toBeLessThan(
        expected: number | bigint
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * For comparing floating point numbers.
       */
      toBeLessThanOrEqual(
        expected: number | bigint
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * This is the same as `.toBe(null)` but the error messages are a bit nicer.
       * So use `.toBeNull()` when you want to check that something is null.
       */
      toBeNull(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Use when you don't care what a value is, you just want to ensure a value
       * is true in a boolean context. In JavaScript, there are six falsy values:
       * `false`, `0`, `''`, `null`, `undefined`, and `NaN`. Everything else is truthy.
       */
      toBeTruthy(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used to check that a variable is undefined.
       */
      toBeUndefined(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used to check that a variable is NaN.
       */
      toBeNaN(): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used when you want to check that an item is in a list.
       * For testing the items in the list, this uses `===`, a strict equality check.
       */
      toContain(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used when you want to check that an item is in a list.
       * For testing the items in the list, this  matcher recursively checks the
       * equality of all fields, rather than checking for object identity.
       */
      toContainEqual(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used when you want to check that two objects have the same value.
       * This matcher recursively checks the equality of all fields, rather than checking for object identity.
       */
      toEqual(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used to check that an object has a `.length` property
       * and it is set to a certain numeric value.
       */
      toHaveLength(
        expected: number
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Use to check if property at provided reference keyPath exists for an object.
       * For checking deeply nested properties in an object you may use dot notation or an array containing
       * the keyPath for deep references.
       *
       * Optionally, you can provide a value to check if it's equal to the value present at keyPath
       * on the target object. This matcher uses 'deep equality' (like `toEqual()`) and recursively checks
       * the equality of all fields.
       *
       * @example
       *
       * expect(houseForSale).toHaveProperty('kitchen.area', 20);
       */
      toHaveProperty(
        keyPath: string | Array<string>,
        value?: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Check that a string matches a regular expression.
       */
      toMatch(
        expected: string | RegExp
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Used to check that a JavaScript object matches a subset of the properties of an object
       */
      toMatchObject(
        expected: Record<string, unknown> | Array<unknown>
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
      /**
       * Use to test that objects have the same types as well as structure.
       */
      toStrictEqual(
        expected: unknown
      ): Matchers<R> & Inverse<Matchers<R>> & PromiseMatchers;
    }

    /**
     * The {@link LocatorAssertions} class provides assertion methods that can be used to make assertions about the {@link
     * Locator} state in the tests.
     *
     * ```js
     * import { test, expect } from '@playwright/test';
     *
     * test('status becomes submitted', async ({ page }) => {
     *   // ...
     *   await page.getByRole('button').click();
     *   await expect(page.locator('.status')).toHaveText('Submitted');
     * });
     * ```
     *
     */
    export interface LocatorAssertions {
      /**
       * Ensures that {@link Locator} points to an [attached](https://playwright.dev/docs/actionability#attached) DOM node.
       *
       * **Usage**
       *
       * ```js
       * await expect(page.getByText('Hidden text')).toBeAttached();
       * ```
       *
       * @param options
       */
      toBeAttached(options?: {
        attached?: boolean;

        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to a checked input.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByLabel('Subscribe to newsletter');
       * await expect(locator).toBeChecked();
       * ```
       *
       * @param options
       */
      toBeChecked(options?: {
        checked?: boolean;

        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to a disabled element. Element is disabled if it has "disabled" attribute or is
       * disabled via
       * ['aria-disabled'](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-disabled). Note
       * that only native control elements such as HTML `button`, `input`, `select`, `textarea`, `option`, `optgroup` can be
       * disabled by setting "disabled" attribute. "disabled" attribute on other elements is ignored by the browser.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('button.submit');
       * await expect(locator).toBeDisabled();
       * ```
       *
       * @param options
       */
      toBeDisabled(options?: {
        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an editable element.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByRole('textbox');
       * await expect(locator).toBeEditable();
       * ```
       *
       * @param options
       */
      toBeEditable(options?: {
        editable?: boolean;

        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an empty editable element or to a DOM node that has no text.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('div.warning');
       * await expect(locator).toBeEmpty();
       * ```
       *
       * @param options
       */
      toBeEmpty(options?: {
        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an enabled element.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('button.submit');
       * await expect(locator).toBeEnabled();
       * ```
       *
       * @param options
       */
      toBeEnabled(options?: {
        enabled?: boolean;

        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to a focused DOM node.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByRole('textbox');
       * await expect(locator).toBeFocused();
       * ```
       *
       * @param options
       */
      toBeFocused(options?: {
        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures that {@link Locator} either does not resolve to any DOM node, or resolves to a
       * [non-visible](https://playwright.dev/docs/actionability#visible) one.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('.my-element');
       * await expect(locator).toBeHidden();
       * ```
       *
       * @param options
       */
      toBeHidden(options?: {
        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element that intersects viewport, according to the
       * [intersection observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByRole('button');
       * // Make sure at least some part of element intersects viewport.
       * await expect(locator).toBeInViewport();
       * // Make sure element is fully outside of viewport.
       * await expect(locator).not.toBeInViewport();
       * // Make sure that at least half of the element intersects viewport.
       * await expect(locator).toBeInViewport({ ratio: 0.5 });
       * ```
       *
       * @param options
       */
      toBeInViewport(options?: {
        /**
         * The minimal ratio of the element to intersect viewport. If equals to `0`, then element should intersect viewport at
         * any positive ratio. Defaults to `0`.
         */
        ratio?: number;

        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;
      }): Promise<void>;

      /**
       * Ensures that {@link Locator} points to an [attached](https://playwright.dev/docs/actionability#attached) and
       * [visible](https://playwright.dev/docs/actionability#visible) DOM node.
       *
       * **Usage**
       *
       * ```js
       * await expect(page.getByText('Welcome')).toBeVisible();
       * ```
       *
       * @param options
       */
      toBeVisible(options?: {
        /**
         * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
         */
        timeout?: number;

        visible?: boolean;
      }): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element that contains the given text. You can use regular expressions for
       * the value as well.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('.title');
       * await expect(locator).toContainText('substring');
       * await expect(locator).toContainText(/\d messages/);
       * ```
       *
       * If you pass an array as an expected value, the expectations are:
       * 1. Locator resolves to a list of elements.
       * 1. Elements from a **subset** of this list contain text from the expected array, respectively.
       * 1. The matching subset of elements has the same order as the expected array.
       * 1. Each text value from the expected array is matched by some element from the list.
       *
       * For example, consider the following list:
       *
       * ```html
       * <ul>
       *   <li>Item Text 1</li>
       *   <li>Item Text 2</li>
       *   <li>Item Text 3</li>
       * </ul>
       * ```
       *
       * Let's see how we can use the assertion:
       *
       * ```js
       * // ✓ Contains the right items in the right order
       * await expect(page.locator('ul > li')).toContainText(['Text 1', 'Text 3']);
       *
       * // ✖ Wrong order
       * await expect(page.locator('ul > li')).toContainText(['Text 3', 'Text 2']);
       *
       * // ✖ No item contains this text
       * await expect(page.locator('ul > li')).toContainText(['Some 33']);
       *
       * // ✖ Locator points to the outer list element, not to the list items
       * await expect(page.locator('ul')).toContainText(['Text 3']);
       * ```
       *
       * @param expected Expected substring or RegExp or a list of those.
       * @param options
       */
      toContainText(
        expected: string | RegExp | Array<string | RegExp>,
        options?: {
          /**
           * Whether to perform case-insensitive match. `ignoreCase` option takes precedence over the corresponding regular
           * expression flag if specified.
           */
          ignoreCase?: boolean;

          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;

          /**
           * Whether to use `element.innerText` instead of `element.textContent` when retrieving DOM node text.
           */
          useInnerText?: boolean;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with given attribute.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('input');
       * await expect(locator).toHaveAttribute('type', 'text');
       * ```
       *
       * @param name Attribute name.
       * @param value Expected attribute value.
       * @param options
       */
      toHaveAttribute(
        name: string,
        value: string | RegExp,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with given CSS classes. This needs to be a full match or using a
       * relaxed regular expression.
       *
       * **Usage**
       *
       * ```html
       * <div class='selected row' id='component'></div>
       * ```
       *
       * ```js
       * const locator = page.locator('#component');
       * await expect(locator).toHaveClass(/selected/);
       * await expect(locator).toHaveClass('selected row');
       * ```
       *
       * Note that if array is passed as an expected value, entire lists of elements can be asserted:
       *
       * ```js
       * const locator = page.locator('list > .component');
       * await expect(locator).toHaveClass(['component', 'component selected', 'component']);
       * ```
       *
       * @param expected Expected class or RegExp or a list of those.
       * @param options
       */
      toHaveClass(
        expected: string | RegExp | Array<string | RegExp>,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} resolves to an exact number of DOM nodes.
       *
       * **Usage**
       *
       * ```js
       * const list = page.locator('list > .component');
       * await expect(list).toHaveCount(3);
       * ```
       *
       * @param count Expected count.
       * @param options
       */
      toHaveCount(
        count: number,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} resolves to an element with the given computed CSS style.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByRole('button');
       * await expect(locator).toHaveCSS('display', 'flex');
       * ```
       *
       * @param name CSS property name.
       * @param value CSS property value.
       * @param options
       */
      toHaveCSS(
        name: string,
        value: string | RegExp,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with the given DOM Node ID.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.getByRole('textbox');
       * await expect(locator).toHaveId('lastname');
       * ```
       *
       * @param id Element id.
       * @param options
       */
      toHaveId(
        id: string | RegExp,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with given JavaScript property. Note that this property can be of
       * a primitive type as well as a plain serializable JavaScript object.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('.component');
       * await expect(locator).toHaveJSProperty('loaded', true);
       * ```
       *
       * @param name Property name.
       * @param value Property value.
       * @param options
       */
      toHaveJSProperty(
        name: string,
        value: any,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with the given text. You can use regular expressions for the value
       * as well.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('.title');
       * await expect(locator).toHaveText(/Welcome, Test User/);
       * await expect(locator).toHaveText(/Welcome, .*\/);
       * ```
       *
       * If you pass an array as an expected value, the expectations are:
       * 1. Locator resolves to a list of elements.
       * 1. The number of elements equals the number of expected values in the array.
       * 1. Elements from the list have text matching expected array values, one by one, in order.
       *
       * For example, consider the following list:
       *
       * ```html
       * <ul>
       *   <li>Text 1</li>
       *   <li>Text 2</li>
       *   <li>Text 3</li>
       * </ul>
       * ```
       *
       * Let's see how we can use the assertion:
       *
       * ```js
       * // ✓ Has the right items in the right order
       * await expect(page.locator('ul > li')).toHaveText(['Text 1', 'Text 2', 'Text 3']);
       *
       * // ✖ Wrong order
       * await expect(page.locator('ul > li')).toHaveText(['Text 3', 'Text 2', 'Text 1']);
       *
       * // ✖ Last item does not match
       * await expect(page.locator('ul > li')).toHaveText(['Text 1', 'Text 2', 'Text']);
       *
       * // ✖ Locator points to the outer list element, not to the list items
       * await expect(page.locator('ul')).toHaveText(['Text 1', 'Text 2', 'Text 3']);
       * ```
       *
       * @param expected Expected string or RegExp or a list of those.
       * @param options
       */
      toHaveText(
        expected: string | RegExp | Array<string | RegExp>,
        options?: {
          /**
           * Whether to perform case-insensitive match. `ignoreCase` option takes precedence over the corresponding regular
           * expression flag if specified.
           */
          ignoreCase?: boolean;

          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;

          /**
           * Whether to use `element.innerText` instead of `element.textContent` when retrieving DOM node text.
           */
          useInnerText?: boolean;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to an element with the given input value. You can use regular expressions for
       * the value as well.
       *
       * **Usage**
       *
       * ```js
       * const locator = page.locator('input[type=number]');
       * await expect(locator).toHaveValue(/[0-9]/);
       * ```
       *
       * @param value Expected value.
       * @param options
       */
      toHaveValue(
        value: string | RegExp,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Ensures the {@link Locator} points to multi-select/combobox (i.e. a `select` with the `multiple` attribute) and the
       * specified values are selected.
       *
       * **Usage**
       *
       * For example, given the following element:
       *
       * ```html
       * <select id="favorite-colors" multiple>
       *   <option value="R">Red</option>
       *   <option value="G">Green</option>
       *   <option value="B">Blue</option>
       * </select>
       * ```
       *
       * ```js
       * const locator = page.locator('id=favorite-colors');
       * await locator.selectOption(['R', 'G']);
       * await expect(locator).toHaveValues([/R/, /G/]);
       * ```
       *
       * @param values Expected options currently selected.
       * @param options
       */
      toHaveValues(
        values: Array<string | RegExp>,
        options?: {
          /**
           * Time to retry the assertion for in milliseconds. Defaults to `timeout` in `TestConfig.expect`.
           */
          timeout?: number;
        }
      ): Promise<void>;

      /**
       * Makes the assertion check for the opposite condition. For example, this code tests that the Locator doesn't contain
       * text `"error"`:
       *
       * ```js
       * await expect(locator).not.toContainText('error');
       * ```
       *
       */
      not: LocatorAssertions;
    }
  }
}

export const expect = playwrightExpect as unknown as Expect;

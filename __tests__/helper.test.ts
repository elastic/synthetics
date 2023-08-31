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

import { cwd } from 'process';
import {
  indent,
  monotonicTimeInSeconds,
  formatError,
  findPkgJsonByTraversing,
  generateTempPath,
  rewriteErrorStack,
  findPWLogsIndexes,
  microSecsToSeconds,
  wrapFnWithLocation,
  replaceFileNameWithJourneyName,
  isMatch,
} from '../src/helpers';

it('indent message with seperator', () => {
  // tabWidth: 2
  const separator = ' ';
  const message = 'hello world';
  expect(indent(message, separator)).toEqual(separator + message);
});

it('get monotonic clock time', () => {
  jest.spyOn(process, 'hrtime').mockImplementation(() => {
    return [392583, 998697551];
  });
  const elapsedTime = monotonicTimeInSeconds();
  expect(elapsedTime).toBe(392583.998697551);
});

it('convert trace timestamp to internal time', () => {
  const traceTimestamp = 392583998697;
  const elapsedTime = microSecsToSeconds(traceTimestamp);
  expect(elapsedTime).toBe(392583.998697);
});

describe('formatting errors', () => {
  it('formats proper errors', () => {
    const error = new Error('testing');
    const { name, message, stack } = error;
    const formatted = formatError(error);
    expect(formatted).toStrictEqual({
      name,
      message,
      stack,
    });
  });

  ["c'est ne pas une Error", 42, { an: 'object' }].forEach(obj => {
    it(`formats thrown non-error errors like: ${obj}(${typeof obj})`, () => {
      const formatted = formatError(obj) as Error;
      expect(formatted.message).toContain(`${obj}`);
      expect(formatted.name).toStrictEqual('');
      expect(formatted.stack).toStrictEqual('');
      expect(typeof formatted.message).toBe('string');
    });
  });

  [null, undefined].forEach(obj => {
    it(`returns undefined for ${typeof obj}`, () => {
      expect(formatError(obj)).toBe(undefined);
    });
  });
});

it('throw error when no package.json found', async () => {
  try {
    const tempPath = generateTempPath();
    await findPkgJsonByTraversing(tempPath, cwd());
  } catch (e) {
    expect(e).toMatch('Could not find package.json file in');
  }
});

it('rewrite error stack from Playwright', () => {
  const playwrightStack = `Error: page.hover: Frame has been detached.
  =========================== logs ===========================
  [api] waiting for selector "css=[data-nav-item=products]"
  [api]   selector resolved to visible <li data-nav-item="products" class="jsx-4008395266 n…>…</li>
  [api] attempting hover action
  [api]   waiting for element to be visible, enabled and not moving
  [api]   element is visible, enabled and does not move
  [api]   scrolling into view if needed
  [api]   done scrolling
  [api]   checking that element receives pointer events at (267.02,42)
  [api]   element does not receive pointer events
  [api] retrying hover action
  [api]   waiting for element to be visible, enabled and not moving
  [api]   element is visible, enabled and does not move
  [api]   scrolling into view if needed
  [api]   done scrolling
  [api]   checking that element receives pointer events at (267.02,42)
  [api]   element does not receive pointer events
  [api] retrying hover action
  [api]   waiting for element to be visible, enabled and not moving
  [api]   element is visible, enabled and does not move
  [api]   scrolling into view if needed
  [api]   done scrolling
  [api]   checking that element receives pointer events at (267.02,42)
  [api]   element does not receive pointer events
  ============================================================
  Note: use DEBUG=pw:api environment variable and rerun to capture Playwright logs.:
    at Connection.sendMessageToServer (mockedPath/client/connection.js:69:15)
    at Proxy.<anonymous> (mockedPath/client/channelOwner.js:54:53)
    at Page.hover (mockedPath/client/page.js:415:21)
    at Step.eval [as callback] (eval at loadInlineScript (mockedPath/src/cli.ts:52:20), <anonymous>:10:14)`;

  const indexes = findPWLogsIndexes(playwrightStack);
  const newPlaywrightStack = rewriteErrorStack(playwrightStack, indexes).split(
    '\n'
  );
  expect(newPlaywrightStack).toMatchObject([
    'Error: page.hover: Frame has been detached.',
    '  =========================== logs ===========================',
    '  [api] waiting for selector "css=[data-nav-item=products]"',
    '  [api]   selector resolved to visible <li data-nav-item="products" class="jsx-4008395266 n…>…</li>',
    '  ============================================================',
    '  Note: use DEBUG=pw:api environment variable and rerun to capture Playwright logs.:',
    '    at Connection.sendMessageToServer (mockedPath/client/connection.js:69:15)',
    '    at Proxy.<anonymous> (mockedPath/client/channelOwner.js:54:53)',
    '    at Page.hover (mockedPath/client/page.js:415:21)',
    '    at Step.eval [as callback] (eval at loadInlineScript (mockedPath/src/cli.ts:52:20), <anonymous>:10:14)',
  ]);
});

it('does not rewrite non playwright errors', () => {
  const normalStack = new Error('Tets').stack as string;
  const indexes = findPWLogsIndexes(normalStack);
  const newNormalStack = rewriteErrorStack(normalStack, indexes);
  expect(normalStack).toStrictEqual(newNormalStack);
});

it('location info on execution', () => {
  const checkLoc = wrapFnWithLocation(location => {
    return location;
  });
  // line no and column no will not match as we are using
  // ts-jest preset to transpile code.
  expect(checkLoc().file).toBe(__filename);
});

it('match tags and names', () => {
  // match tags
  expect(isMatch(['foo', 'bar'], 'test', ['foo*'])).toBe(true);
  expect(isMatch(['bar', 'baz'], 'test', ['b*'])).toBe(true);
  expect(isMatch(['bar', 'baz'], 'test', ['c*'])).toBe(false);
  // prefer tags over names
  expect(isMatch(['bar', 'baz'], 'foo', ['c*'], 'foo')).toBe(false);
  // match names when no tags
  expect(isMatch(['bar'], 'foo', undefined, 'fo*')).toBe(true);
  // match both name and tags
  expect(isMatch(['bar'], 'foo', undefined, 'ba*')).toBe(true);
  expect(isMatch(['bar'], 'foo', undefined, 'test*')).toBe(false);
});

it('replace default path fileName with journey name', () => {
  const newPath = replaceFileNameWithJourneyName({
    filePath: '.journeys/videos/34567898765678237jnsdjkhfhjdsbf.webm',
    journeyName: 'test-journey',
  });

  expect(newPath).toBe('.journeys/videos/test-journey.webm');
});

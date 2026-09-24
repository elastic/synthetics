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
  findPkgJsonByTraversing,
  generateTempPath,
  rewriteErrorStack,
  findPWLogsIndexes,
  microSecsToSeconds,
  wrapFnWithLocation,
  isMatch,
  paramsFromEnv,
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

describe('paramsFromEnv', () => {
  const KEYS = ['USER_EMAIL', 'USER_PASSWORD', 'API_URL'];
  const original = KEYS.map(key => [key, process.env[key]] as const);

  beforeEach(() => {
    KEYS.forEach(key => delete process.env[key]);
  });

  afterEach(() => {
    original.forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('reads required variables using their own names', () => {
    process.env.USER_EMAIL = 'user@example.com';
    process.env.USER_PASSWORD = 'secret';
    expect(paramsFromEnv(['USER_EMAIL', 'USER_PASSWORD'])).toEqual({
      USER_EMAIL: 'user@example.com',
      USER_PASSWORD: 'secret',
    });
  });

  it('throws with every missing variable name', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(() =>
      paramsFromEnv(['USER_EMAIL', 'USER_PASSWORD', 'API_URL'])
    ).toThrow('Missing required environment variables: USER_PASSWORD, API_URL');
  });

  it('uses the singular form for a single missing variable', () => {
    expect(() => paramsFromEnv(['API_URL'])).toThrow(
      'Missing required environment variable: API_URL'
    );
  });

  it('omits optional variables passed in the options', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(
      paramsFromEnv(['USER_EMAIL', 'API_URL'], { optional: ['API_URL'] })
    ).toEqual({ USER_EMAIL: 'user@example.com' });
  });

  it('omits optional variables in the object form', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(
      paramsFromEnv({ USER_EMAIL: {}, API_URL: { required: false } })
    ).toEqual({
      USER_EMAIL: 'user@example.com',
    });
  });

  it('omits optional variables passed in the options for the object form', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(
      paramsFromEnv({ USER_EMAIL: {}, API_URL: {} }, { optional: ['API_URL'] })
    ).toEqual({
      USER_EMAIL: 'user@example.com',
    });
  });

  it('lets an explicit required flag override the options list in the object form', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(() =>
      paramsFromEnv(
        { USER_EMAIL: {}, API_URL: { required: true } },
        { optional: ['API_URL'] }
      )
    ).toThrow('Missing required environment variable: API_URL');
  });

  it('treats empty variables as missing', () => {
    process.env.API_URL = '';
    expect(() => paramsFromEnv(['API_URL'])).toThrow(
      'Missing required environment variable: API_URL'
    );
  });

  it('renames params in the object form', () => {
    process.env.USER_EMAIL = 'user@example.com';
    expect(paramsFromEnv({ USER_EMAIL: { param: 'userEmail' } })).toEqual({
      userEmail: 'user@example.com',
    });
  });

  it('camelCases params when requested', () => {
    process.env.USER_EMAIL = 'user@example.com';
    process.env.API_URL = 'https://example.com';
    expect(
      paramsFromEnv(['USER_EMAIL', 'API_URL'], { camelCase: true })
    ).toEqual({
      userEmail: 'user@example.com',
      apiUrl: 'https://example.com',
    });
  });
});

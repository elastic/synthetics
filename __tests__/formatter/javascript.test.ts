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
  SyntheticsGenerator,
  ActionInContext,
} from '../../src/formatter/javascript';

const recorderActions: Array<ActionInContext> = [
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'about:blank',
    committed: true,
    action: {
      name: 'openPage',
      url: 'about:blank',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    committed: true,
    action: {
      name: 'navigate',
      url: 'https://vigneshh.in/',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    action: {
      name: 'assert',
      isAssert: true,
      command: 'isVisible',
      selector: 'text=Babel Minify',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    action: {
      name: 'assert',
      isAssert: true,
      command: 'isEditable',
      selector: 'text=Babel Minify',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    action: {
      name: 'assert',
      isAssert: true,
      command: 'textContent',
      selector: 'text=Babel Minify',
      value: 'Babel',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    action: {
      name: 'click',
      selector: 'text=Babel Minify',
      signals: [
        {
          name: 'popup',
          popupAlias: 'page1',
          isAsync: true,
        },
      ],
      button: 'left',
      modifiers: 0,
      clickCount: 1,
    },
    committed: true,
  },
  {
    pageAlias: 'page1',
    isMainFrame: true,
    frameUrl: 'https://github.com/babel/minify',
    action: {
      name: 'click',
      selector: 'a:has-text("smoke")',
      signals: [
        {
          name: 'navigation',
          url: 'https://github.com/babel/minify',
        },
        {
          name: 'navigation',
          url: 'https://github.com/babel/minify/tree/master/smoke',
        },
        {
          name: 'navigation',
          url: 'https://github.com/babel/minify/tree/master/smoke',
          isAsync: true,
        },
        {
          name: 'navigation',
          url: 'https://github.com/babel/minify',
          isAsync: true,
        },
      ],
      button: 'left',
      modifiers: 0,
      clickCount: 1,
    },
  },
  {
    pageAlias: 'page1',
    isMainFrame: true,
    frameUrl: 'https://github.com/babel/minify',
    committed: true,
    action: {
      name: 'closePage',
      signals: [],
    },
  },
  {
    pageAlias: 'page',
    isMainFrame: true,
    frameUrl: 'https://vigneshh.in/',
    committed: true,
    action: {
      name: 'closePage',
      signals: [],
    },
  },
];

describe('Synthetics JavaScript formatter', () => {
  it('inline journeys', async () => {
    const formatter = new SyntheticsGenerator(false);
    expect(formatter.generateText(recorderActions)).toMatchSnapshot();
  });

  it('suite journeys', async () => {
    const formatter = new SyntheticsGenerator(true);
    expect(formatter.generateText(recorderActions)).toMatchSnapshot();
  });
});

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
  Step,
  Steps,
} from '../../src/formatter/javascript';

const recorderStep: Step = {
  actions: [
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
  ],
};

describe('Synthetics JavaScript formatter', () => {
  it('accepts custom step organization', () => {
    const generator = new SyntheticsGenerator(true);
    const testSteps: Steps = [
      { actions: recorderStep.actions.slice(0, 2) },
      { actions: recorderStep.actions.slice(2, 4) },
      { actions: recorderStep.actions.slice(4, 7) },
      { actions: recorderStep.actions.slice(7, 9) },
    ];
    expect(generator.generateFromSteps(testSteps)).toMatchSnapshot();
  });

  it('uses custom step names', () => {
    const generator = new SyntheticsGenerator(false);
    const testSteps: Steps = [{ actions: recorderStep.actions.slice(0, 4) }];
    expect(
      generator.generateFromSteps(
        testSteps.map((s: Step) => {
          s.name = 'test-name';
          return s;
        })
      )
    ).toMatchSnapshot();
  });

  it('throws error if processing empty step', () => {
    const generator = new SyntheticsGenerator(false);
    const testSteps: Steps = [{ actions: [] }];
    expect(() => generator.generateFromSteps(testSteps)).toThrowError(
      'Cannot process an empty step'
    );
  });
});

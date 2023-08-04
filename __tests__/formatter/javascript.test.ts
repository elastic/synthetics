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
      frame: { pageAlias: 'page', isMainFrame: true, url: 'about:blank' },
      committed: true,
      action: {
        name: 'openPage',
        url: 'about:blank',
        signals: [],
      },
    },
    {
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
      committed: true,
      action: {
        name: 'navigate',
        url: 'https://vigneshh.in/',
        signals: [],
      },
    },
    {
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
      action: {
        name: 'assert',
        isAssert: true,
        command: 'isVisible',
        selector: 'text=Babel Minify',
        signals: [],
      },
    },
    {
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
      action: {
        name: 'assert',
        isAssert: true,
        command: 'isEditable',
        selector: 'text=Babel Minify',
        signals: [],
      },
    },
    {
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
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
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
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
      frame: {
        pageAlias: 'page1',
        isMainFrame: true,
        url: 'https://github.com/babel/minify',
      },
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
      frame: {
        pageAlias: 'page1',
        isMainFrame: true,
        url: 'https://github.com/babel/minify',
      },
      committed: true,
      action: {
        name: 'closePage',
        signals: [],
      },
    },
    {
      frame: {
        pageAlias: 'page',
        isMainFrame: true,
        url: 'https://vigneshh.in/',
      },
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

  it('counts pages that cross steps', () => {
    const generator = new SyntheticsGenerator(false);
    const steps: Steps = [
      {
        actions: [
          {
            frame: {
              pageAlias: 'page',
              isMainFrame: true,
              url: 'https://vigneshh.in/',
            },
            committed: true,
            action: {
              name: 'navigate',
              url: 'https://vigneshh.in/',
              signals: [],
            },
            title: 'Go to https://vigneshh.in/',
          },
          {
            frame: {
              pageAlias: 'page',
              isMainFrame: true,
              url: 'https://vigneshh.in/',
            },
            action: {
              name: 'click',
              selector: 'internal:role=link[name="Tailor"i]',
              signals: [
                {
                  name: 'popup',
                  popupAlias: 'page1',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/zalando/tailor',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/zalando/tailor',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:role=link[name="Tailor"i]',
          },
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/zalando/tailor',
            },
            action: {
              name: 'click',
              selector: 'internal:role=link[name="Packages"i]',
              signals: [
                {
                  name: 'navigation',
                  url: 'https://github.com/zalando/tailor',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:role=link[name="Packages"i]',
          },
        ],
      },
      {
        actions: [
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
            },
            action: {
              name: 'click',
              selector: 'internal:role=link[name="Repositories"i]',
              signals: [
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/repositories',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/repositories',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:role=link[name="Repositories"i]',
          },
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/orgs/zalando/repositories',
            },
            action: {
              name: 'click',
              selector: 'internal:attr=[placeholder="Find a repository…"i]',
              signals: [],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:attr=[placeholder="Find a repository…"i]',
          },
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/orgs/zalando/repositories',
            },
            action: {
              name: 'fill',
              selector: 'internal:attr=[placeholder="Find a repository…"i]',
              signals: [
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/repositories?q=tailor&type=all&language=&sort=',
                },
              ],
              text: 'tailor',
            },
            committed: true,
            title: 'Fill internal:attr=[placeholder="Find a repository…"i]',
          },
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/orgs/zalando/repositories?q=tailor&type=all&language=&sort=',
            },
            action: {
              name: 'click',
              selector: 'internal:role=link[name="tailor"i]',
              signals: [
                {
                  name: 'navigation',
                  url: 'https://github.com/orgs/zalando/repositories?q=tailor&type=all&language=&sort=',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/zalando/tailor',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/zalando/tailor',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:role=link[name="tailor"i]',
          },
        ],
      },
      {
        actions: [
          {
            frame: {
              pageAlias: 'page',
              isMainFrame: true,
              url: 'https://vigneshh.in/',
            },
            action: {
              name: 'click',
              selector: 'internal:role=link[name="Babel Minify"i]',
              signals: [
                {
                  name: 'popup',
                  popupAlias: 'page2',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/babel/minify',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/babel/minify',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:role=link[name="Babel Minify"i]',
          },
          {
            frame: {
              pageAlias: 'page2',
              isMainFrame: true,
              url: 'https://github.com/babel/minify',
            },
            action: {
              name: 'click',
              selector: 'internal:attr=[title="Topic: babel-minify"i]',
              signals: [
                {
                  name: 'navigation',
                  url: 'https://github.com/babel/minify',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/babel/minify',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/topics/babel-minify',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/topics/babel-minify',
                },
                {
                  name: 'navigation',
                  url: 'https://github.com/topics/babel-minify',
                },
              ],
              button: 'left',
              modifiers: 0,
              clickCount: 1,
            },
            committed: true,
            title: 'Click internal:attr=[title="Topic: babel-minify"i]',
          },
        ],
      },
      {
        actions: [
          {
            frame: {
              pageAlias: 'page2',
              isMainFrame: true,
              url: 'https://github.com/topics/babel-minify',
            },
            committed: true,
            action: {
              name: 'closePage',
              signals: [],
            },
            title: 'Close page',
          },
        ],
      },
      {
        actions: [
          {
            frame: {
              pageAlias: 'page1',
              isMainFrame: true,
              url: 'https://github.com/zalando/tailor',
            },
            committed: true,
            action: {
              name: 'closePage',
              signals: [],
            },
            title: 'Close page',
          },
        ],
      },
    ];
    expect(generator.findVarsToHoist(steps)).toEqual(['page1', 'page2']);
  });

  it('does not hoist when all accesses are in one step', () => {
    expect(
      new SyntheticsGenerator(false).generateFromSteps([
        {
          actions: [
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              committed: true,
              action: {
                name: 'navigate',
                url: 'https://vigneshh.in/',
                signals: [],
              },
              title: 'Go to https://vigneshh.in/',
            },
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'internal:role=link[name="Tailor"i]',
                signals: [
                  {
                    name: 'popup',
                    popupAlias: 'page1',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/zalando/tailor',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/zalando/tailor',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
              committed: true,
              title: 'Click internal:role=link[name="Tailor"i]',
            },
            {
              frame: {
                pageAlias: 'page1',
                isMainFrame: true,
                url: 'https://github.com/zalando/tailor',
              },
              action: {
                name: 'click',
                selector: 'internal:role=link[name="Packages"i]',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/zalando/tailor',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
              committed: true,
              title: 'Click internal:role=link[name="Packages"i]',
            },
            {
              frame: {
                pageAlias: 'page1',
                isMainFrame: true,
                url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
              },
              action: {
                name: 'click',
                selector: 'internal:role=link[name="@zalando Zalando SE"i]',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/zalando',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/zalando',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
              committed: true,
              title: 'Click internal:role=link[name="@zalando Zalando SE"i]',
            },
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'internal:role=link[name="Babel Minify"i]',
                signals: [
                  {
                    name: 'popup',
                    popupAlias: 'page2',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/babel/minify',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/babel/minify',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
              committed: true,
              title: 'Click internal:role=link[name="Babel Minify"i]',
            },
            {
              frame: {
                pageAlias: 'page2',
                isMainFrame: true,
                url: 'https://github.com/babel/minify',
              },
              action: {
                name: 'click',
                selector: 'internal:attr=[title="Topic: babel-minify"i]',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/babel/minify',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/babel/minify',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/topics/babel-minify',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/topics/babel-minify',
                  },
                  {
                    name: 'navigation',
                    url: 'https://github.com/topics/babel-minify',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
              committed: true,
              title: 'Click internal:attr=[title="Topic: babel-minify"i]',
            },
            {
              frame: {
                pageAlias: 'page2',
                isMainFrame: true,
                url: 'https://github.com/topics/babel-minify',
              },
              committed: true,
              action: {
                name: 'closePage',
                signals: [],
              },
              title: 'Close page',
            },
            {
              frame: {
                pageAlias: 'page1',
                isMainFrame: true,
                url: 'https://github.com/zalando',
              },
              committed: true,
              action: {
                name: 'closePage',
                signals: [],
              },
              title: 'Close page',
            },
          ],
        },
      ])
    ).toMatchSnapshot();
  });

  it('hoist accounts for popup alias', () => {
    expect(
      new SyntheticsGenerator(false).generateFromSteps([
        {
          actions: [
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'navigate',
                url: 'https://vigneshh.in/',
                signals: [],
              },
            },
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'text=Tailor',
                signals: [
                  { name: 'popup', popupAlias: 'page1', isAsync: true },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
            {
              frame: {
                url: 'https://github.com/zalando/tailor',
                pageAlias: 'page1',
              },
              action: {
                name: 'click',
                selector: 'text=Packages 0',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
          ],
        },
        {
          actions: [
            {
              frame: {
                pageAlias: 'page1',
                url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                isMainFrame: true,
              },
              action: { name: 'closePage', signals: [] },
            },

            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'text=Babel Minify',
                signals: [
                  { name: 'popup', popupAlias: 'page2', isAsync: true },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
          ],
        },
        {
          actions: [
            {
              frame: {
                url: 'https://github.com/babel/minify',
                pageAlias: 'page2',
              },
              action: { name: 'closePage', signals: [] },
            },
          ],
        },
      ])
    ).toMatchSnapshot();
  });

  it('hoists page objects to prevent undefined references', () => {
    expect(
      new SyntheticsGenerator(false).generateFromSteps([
        {
          actions: [
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'navigate',
                url: 'https://vigneshh.in/',
                signals: [],
              },
            },
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'text=Tailor',
                signals: [
                  { name: 'popup', popupAlias: 'page1', isAsync: true },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
            {
              frame: {
                pageAlias: 'page1',
                isMainFrame: true,
                url: 'https://github.com/zalando/tailor',
              },
              action: {
                name: 'click',
                selector: 'text=Packages 0',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
          ],
        },
        {
          actions: [
            {
              frame: {
                pageAlias: 'page1',
                isMainFrame: true,
                url: 'https://github.com/orgs/zalando/packages?repo_name=tailor',
              },
              action: { name: 'closePage', signals: [] },
            },
          ],
        },
        {
          actions: [
            {
              frame: {
                pageAlias: 'page',
                isMainFrame: true,
                url: 'https://vigneshh.in/',
              },
              action: {
                name: 'click',
                selector: 'text=Babel Minify',
                signals: [
                  { name: 'popup', popupAlias: 'page2', isAsync: true },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
            {
              frame: {
                pageAlias: 'page2',
                isMainFrame: true,
                url: 'https://github.com/babel/minify',
              },
              action: {
                name: 'click',
                selector: ':nth-match(a:has-text("babel-minify"), 3)',
                signals: [
                  {
                    name: 'navigation',
                    url: 'https://github.com/topics/babel-minify',
                  },
                ],
                button: 'left',
                modifiers: 0,
                clickCount: 1,
              },
            },
          ],
        },
        {
          actions: [
            {
              frame: {
                url: 'https://github.com/topics/babel-minify',
                pageAlias: 'page2',
              },
              action: { name: 'closePage', signals: [] },
            },
          ],
        },
      ])
    ).toMatchSnapshot();
  });
});

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
  JavaScriptLanguageGenerator,
  JavaScriptFormatter,
} from 'playwright-chromium/lib/server/supplements/recorder/javascript';

export type ActionInContext = {
  pageAlias: string;
  frameName?: string;
  frameUrl: string;
  isMainFrame: boolean;
  action: Action;
  committed?: boolean;
  modified?: boolean;
  title?: string;
};

type Action = {
  name: string;
  selector?: string;
  url?: string;
  key?: string;
  signals: Signal[];
  modifiers?: number;
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  text?: string;
  value?: string;
  isAssert?: boolean;
  command?: string;
};

type Signal = {
  name: string;
  url?: string;
  isAsync?: boolean;
  popupAlias?: string;
  downloadAlias?: string;
  dialogAlias?: string;
};

export class SyntheticsGenerator extends JavaScriptLanguageGenerator {
  private previousContext: ActionInContext;
  private insideStep: boolean;

  constructor(private isSuite: boolean) {
    super(true);
    this.insideStep = false;
    this.previousContext = undefined;
  }

  generateAction(actionInContext: ActionInContext) {
    const { action, pageAlias, title } = actionInContext;
    if (action.name === 'openPage') {
      return '';
    }
    // Don't cleanup page object managed by Synthetics
    const isCleanUp = action.name === 'closePage' && pageAlias === 'page';
    if (isCleanUp) {
      return '';
    }

    let formatter = new JavaScriptFormatter(this.isSuite ? 2 : 0);
    // Check if it's a new step
    const isNewStep = this.isNewStep(actionInContext);
    if (isNewStep) {
      if (this.insideStep) {
        formatter.add(this.generateStepEnd());
      }
      formatter.add(this.generateStepStart(title || actionTitle(action)));
    } else {
      formatter = new JavaScriptFormatter(this.isSuite ? 4 : 2);
    }

    const subject = actionInContext.isMainFrame
      ? pageAlias
      : actionInContext.frameName
      ? `${pageAlias}.frame(${formatObject({
          name: actionInContext.frameName,
        })})`
      : `${pageAlias}.frame(${formatObject({
          url: actionInContext.frameUrl,
        })})`;

    const signals = toSignalMap(action);

    if (signals.dialog) {
      formatter.add(`  ${pageAlias}.once('dialog', dialog => {
    console.log(\`Dialog message: $\{dialog.message()}\`);
    dialog.dismiss().catch(() => {});
  });`);
    }

    const emitPromiseAll =
      signals.waitForNavigation || signals.popup || signals.download;
    if (emitPromiseAll) {
      // Generate either await Promise.all([]) or
      // const [popup1] = await Promise.all([]).
      let leftHandSide = '';
      if (signals.popup)
        leftHandSide = `const [${signals.popup.popupAlias}] = `;
      else if (signals.download) leftHandSide = `const [download] = `;
      formatter.add(`${leftHandSide}await Promise.all([`);
    }

    // Popup signals.
    if (signals.popup) formatter.add(`${pageAlias}.waitForEvent('popup'),`);

    // Navigation signal.
    if (signals.waitForNavigation)
      formatter.add(
        `${pageAlias}.waitForNavigation(/*{ url: ${quote(
          signals.waitForNavigation.url
        )} }*/),`
      );

    // Download signals.
    if (signals.download)
      formatter.add(`${pageAlias}.waitForEvent('download'),`);

    const prefix =
      signals.popup || signals.waitForNavigation || signals.download
        ? ''
        : 'await ';
    const actionCall = super._generateActionCall(action);
    // Add assertion from Synthetics.
    const isAssert = action.name === 'assert' && action.isAssert;

    if (!isAssert) {
      const suffix = signals.waitForNavigation || emitPromiseAll ? '' : ';';
      formatter.add(`${prefix}${subject}.${actionCall}${suffix}`);

      if (emitPromiseAll) {
        formatter.add(`]);`);
      } else if (signals.assertNavigation) {
        formatter.add(
          `  expect(${pageAlias}.url()).toBe(${quote(
            signals.assertNavigation.url
          )});`
        );
      }
    } else if (action.command) {
      formatter.add(toAssertCall(pageAlias, action));
    }

    this.previousContext = actionInContext;
    return formatter.format();
  }

  isNewStep(actioninContext: ActionInContext) {
    const { action, frameUrl } = actioninContext;
    if (action.name === 'navigate') {
      return true;
    } else if (action.name === 'click') {
      return (
        this.previousContext?.frameUrl === frameUrl && action.signals.length > 0
      );
    }
    return false;
  }

  generateStepStart(name) {
    this.insideStep = true;
    return `step(${quote(name)}, async () => {`;
  }

  generateStepEnd() {
    if (!this.insideStep) {
      return '';
    }
    this.insideStep = false;
    const formatter = new JavaScriptFormatter(this.isSuite ? 2 : 0);
    formatter.add(`});`);
    return formatter.format();
  }

  generateHeader() {
    const formatter = new JavaScriptFormatter(0);
    formatter.add(`
      const { journey, step, expect } = require('@elastic/synthetics');

      journey('Recorded journey', async ({ page, context }) => {`);
    return formatter.format();
  }

  generateFooter() {
    return `});`;
  }

  generateText(actions: Array<ActionInContext>) {
    const text = [];
    if (this.isSuite) {
      text.push(this.generateHeader());
    }
    for (let i = 0; i < actions.length; i++) {
      text.push(this.generateAction(actions[i]));
      if (i === actions.length - 1) text.push(this.generateStepEnd());
    }
    if (this.isSuite) {
      text.push(this.generateFooter());
    }
    return text.filter(t => Boolean(t)).join('\n');
  }
}

// TODO: Replace once Playwright releases new version
export function quote(text: string, char = "'") {
  const stringified = JSON.stringify(text);
  const escapedText = stringified
    .substring(1, stringified.length - 1)
    .replace(/\\"/g, '"');
  if (char === "'") return char + escapedText.replace(/[']/g, "\\'") + char;
  if (char === '"') return char + escapedText.replace(/["]/g, '\\"') + char;
  if (char === '`') return char + escapedText.replace(/[`]/g, '`') + char;
  throw new Error('Invalid escape char');
}

function toSignalMap(action) {
  let waitForNavigation;
  let assertNavigation;
  let popup;
  let download;
  let dialog;
  for (const signal of action.signals) {
    if (signal.name === 'navigation' && signal.isAsync)
      waitForNavigation = signal;
    else if (signal.name === 'navigation' && !signal.isAsync)
      assertNavigation = signal;
    else if (signal.name === 'popup') popup = signal;
    else if (signal.name === 'download') download = signal;
    else if (signal.name === 'dialog') dialog = signal;
  }
  return {
    waitForNavigation,
    assertNavigation,
    popup,
    download,
    dialog,
  };
}

function toAssertCall(pageAlias, action) {
  const { command, selector, value } = action;
  switch (command) {
    case 'textContent':
    case 'innerText':
      return `expect(await ${pageAlias}.${command}(${quote(
        selector
      )})).toMatch(${quote(value)});`;
    case 'isVisible':
    case 'isHidden':
    case 'isChecked':
    case 'isEditable':
    case 'isEnabled':
    case 'isDisabled':
      return `expect(await ${pageAlias}.${command}(${quote(
        selector
      )})).toBeTruthy();`;
  }
}

function formatObject(value, indent = '  ') {
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value))
    return `[${value.map(o => formatObject(o)).join(', ')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    const tokens = [];
    for (const key of keys) tokens.push(`${key}: ${formatObject(value[key])}`);
    return `{\n${indent}${tokens.join(`,\n${indent}`)}\n}`;
  }
  return String(value);
}

function actionTitle(action) {
  switch (action.name) {
    case 'openPage':
      return `Open new page`;
    case 'closePage':
      return `Close page`;
    case 'check':
      return `Check ${action.selector}`;
    case 'uncheck':
      return `Uncheck ${action.selector}`;
    case 'click': {
      if (action.clickCount === 1) return `Click ${action.selector}`;
      if (action.clickCount === 2) return `Double click ${action.selector}`;
      if (action.clickCount === 3) return `Triple click ${action.selector}`;
      return `${action.clickCount}× click`;
    }
    case 'fill':
      return `Fill ${action.selector}`;
    case 'setInputFiles':
      if (action.files.length === 0) return `Clear selected files`;
      else return `Upload ${action.files.join(', ')}`;
    case 'navigate':
      return `Go to ${action.url}`;
    case 'press':
      return (
        `Press ${action.key}` + (action.modifiers ? ' with modifiers' : '')
      );
    case 'select':
      return `Select ${action.options.join(', ')}`;
  }
}

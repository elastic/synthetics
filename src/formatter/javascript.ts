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
} from './supplements/recorder/javascript';

export type Step = {
  actions: ActionInContext[];
  name?: string;
};

export type Steps = Step[];

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

export type Action = {
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
  files?: string[];
  options?: string[];
};

export type Signal = {
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

  /**
   * Generate code for an action.
   * @param actionInContext The action to create code for.
   * @returns the strings generated for the action.
   */
  override generateAction(actionInContext: ActionInContext) {
    const { action, pageAlias } = actionInContext;
    if (action.name === 'openPage') {
      return '';
    }
    // Don't cleanup page object managed by Synthetics
    const isCleanUp = action.name === 'closePage' && pageAlias === 'page';
    if (isCleanUp) {
      return '';
    }

    const stepIndent = this.insideStep ? 2 : 0;
    const offset = this.isSuite ? 2 + stepIndent : 0 + stepIndent;
    const formatter = new JavaScriptFormatter(offset);

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
    const formatter = new JavaScriptFormatter(this.isSuite ? 2 : 0);
    formatter.add(`step(${quote(name)}, async () => {`);
    return formatter.format();
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

  override generateHeader() {
    const formatter = new JavaScriptFormatter(0);
    formatter.add(`
      const { journey, step, expect } = require('@elastic/synthetics');

      journey('Recorded journey', async ({ page, context }) => {`);
    return formatter.format();
  }

  override generateFooter() {
    return `});`;
  }

  /**
   * Generates JavaScript code from a custom set of steps and nested actions.
   *
   * This function makes no assumptions about where steps should be created,
   * and instead follows the step definitions the caller has defined.
   * @param steps IR to use for code generation
   * @returns a list of the code strings outputted by the generator
   */
  generateFromSteps(steps: Steps): string {
    const text = [];
    if (this.isSuite) {
      text.push(this.generateHeader());
    }
    for (const step of steps) {
      if (step.actions.length === 0)
        throw Error('Cannot process an empty step');
      text.push(
        this.generateStepStart(
          step.name ??
            step.actions[0].title ??
            actionTitle(step.actions[0].action)
        )
      );

      for (const action of step.actions) {
        const actionText = this.generateAction(action);
        if (actionText.length) text.push(actionText);
      }

      text.push(this.generateStepEnd());
    }
    if (this.isSuite) {
      text.push(this.generateFooter());
    }
    return text.filter(s => !!s).join('\n');
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

/**
 * Generates an appropriate title string based on the action type/data.
 * @param action Playwright action IR
 * @returns title string
 */
export function actionTitle(action: Action) {
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
    case 'assert':
      return `Assert ${action.selector} ${action.command}`;
  }
}

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

/**
 * Adapted from playwright-core's `server/codegen/javascript.ts` and
 * `server/codegen/language.ts` (Apache-2.0, (c) Microsoft Corporation).
 *
 * Playwright >= 1.61 bundles its server code into `coreBundle.js` and no
 * longer ships the codegen classes as importable modules, so the previous
 * `playwright-core/lib/server/codegen/javascript` deep import no longer
 * resolves. We only need the slice of the generator that
 * `SyntheticsGenerator` extends (`_asLocator` + `_generateActionCall`) plus
 * `JavaScriptFormatter`; the heavy locator/serialization helpers are still
 * reachable through the bundle's exported `iso` namespace, so we reuse those
 * directly instead of vendoring them too.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { iso } = require('playwright-core/lib/coreBundle') as {
  iso: {
    asLocator(language: string, selector: string): string;
    escapeWithQuotes(text: string, char?: string): string;
    formatObject(value: any, indent?: string): string;
  };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const { asLocator, escapeWithQuotes, formatObject } = iso;

type SmartKeyboardModifier =
  | 'Alt'
  | 'Control'
  | 'ControlOrMeta'
  | 'Meta'
  | 'Shift';

type MouseClickOptions = {
  button?: 'left' | 'middle' | 'right';
  modifiers?: SmartKeyboardModifier[];
  clickCount?: number;
  position?: { x: number; y: number };
};

export type CodegenAction = {
  name: string;
  selector?: string;
  url?: string;
  key?: string;
  text?: string;
  value?: string;
  files?: string[];
  options?: string[];
  modifiers?: number;
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  position?: { x: number; y: number };
  substring?: boolean;
  checked?: boolean;
  ariaSnapshot?: string;
};

export type CodegenActionInContext = {
  action: CodegenAction;
  frame: { pageAlias: string; framePath: string[] };
};

function toKeyboardModifiers(modifiers = 0): SmartKeyboardModifier[] {
  const result: SmartKeyboardModifier[] = [];
  if (modifiers & 1) result.push('Alt');
  if (modifiers & 2) result.push('ControlOrMeta');
  if (modifiers & 4) result.push('ControlOrMeta');
  if (modifiers & 8) result.push('Shift');
  return result;
}

function toClickOptionsForSourceCode(action: CodegenAction): MouseClickOptions {
  const modifiers = toKeyboardModifiers(action.modifiers);
  const options: MouseClickOptions = {};
  if (action.button && action.button !== 'left') options.button = action.button;
  if (modifiers.length) options.modifiers = modifiers;
  // Do not render clickCount === 2 for dblclick.
  if (action.clickCount && action.clickCount > 2)
    options.clickCount = action.clickCount;
  if (action.position) options.position = action.position;
  return options;
}

function formatOptions(value: any, hasArguments: boolean): string {
  const keys = Object.keys(value).filter(key => value[key] !== undefined);
  if (!keys.length) return '';
  return (hasArguments ? ', ' : '') + formatObject(value);
}

function quote(text = ''): string {
  return escapeWithQuotes(text, "'");
}

export function quoteMultiline(text: string, indent = '  ') {
  const escape = (t: string) =>
    t.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const lines = text.split('\n');
  if (lines.length === 1) return '`' + escape(text) + '`';
  return (
    '`\n' +
    lines
      .map(line => indent + escape(line).replace(/\${/g, '\\${'))
      .join('\n') +
    `\n${indent}\``
  );
}

export class JavaScriptLanguageGenerator {
  protected _isTest: boolean;

  constructor(isTest: boolean) {
    this._isTest = isTest;
  }

  protected _asLocator(selector: string) {
    return asLocator('javascript', selector);
  }

  protected _generateActionCall(
    subject: string,
    actionInContext: CodegenActionInContext
  ): string {
    const action = actionInContext.action;
    switch (action.name) {
      case 'openPage':
        throw Error('Not reached');
      case 'closePage':
        return `await ${subject}.close();`;
      case 'click': {
        let method = 'click';
        if (action.clickCount === 2) method = 'dblclick';
        const options = toClickOptionsForSourceCode(action);
        const optionsString = formatOptions(options, false);
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.${method}(${optionsString});`;
      }
      case 'hover':
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.hover(${formatOptions({ position: action.position }, false)});`;
      case 'check':
        return `await ${subject}.${this._asLocator(action.selector)}.check();`;
      case 'uncheck':
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.uncheck();`;
      case 'fill':
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.fill(${quote(action.text)});`;
      case 'setInputFiles': {
        const files = action.files ?? [];
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.setInputFiles(${formatObject(
          files.length === 1 ? files[0] : files
        )});`;
      }
      case 'press': {
        const modifiers = toKeyboardModifiers(action.modifiers);
        const shortcut = [...modifiers, action.key].join('+');
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.press(${quote(shortcut)});`;
      }
      case 'navigate':
        return `await ${subject}.goto(${quote(action.url)});`;
      case 'select': {
        const opts = action.options ?? [];
        return `await ${subject}.${this._asLocator(
          action.selector
        )}.selectOption(${formatObject(opts.length === 1 ? opts[0] : opts)});`;
      }
      case 'assertText':
        return `${
          this._isTest ? '' : '// '
        }await expect(${subject}.${this._asLocator(action.selector)}).${
          action.substring ? 'toContainText' : 'toHaveText'
        }(${quote(action.text)});`;
      case 'assertChecked':
        return `${
          this._isTest ? '' : '// '
        }await expect(${subject}.${this._asLocator(action.selector)})${
          action.checked ? '' : '.not'
        }.toBeChecked();`;
      case 'assertVisible':
        return `${
          this._isTest ? '' : '// '
        }await expect(${subject}.${this._asLocator(
          action.selector
        )}).toBeVisible();`;
      case 'assertValue': {
        const assertion = action.value
          ? `toHaveValue(${quote(action.value)})`
          : `toBeEmpty()`;
        return `${
          this._isTest ? '' : '// '
        }await expect(${subject}.${this._asLocator(
          action.selector
        )}).${assertion};`;
      }
      case 'assertSnapshot': {
        const commentIfNeeded = this._isTest ? '' : '// ';
        return `${commentIfNeeded}await expect(${subject}.${this._asLocator(
          action.selector
        )}).toMatchAriaSnapshot(${quoteMultiline(
          action.ariaSnapshot ?? '',
          `${commentIfNeeded}  `
        )});`;
      }
      default:
        return '';
    }
  }
}

export class JavaScriptFormatter {
  private _baseIndent: string;
  private _baseOffset: string;
  private _lines: string[] = [];

  constructor(offset = 0) {
    this._baseIndent = ' '.repeat(2);
    this._baseOffset = ' '.repeat(offset);
  }

  prepend(text: string) {
    const trim = isMultilineString(text)
      ? (line: string) => line
      : (line: string) => line.trim();
    this._lines = text.trim().split('\n').map(trim).concat(this._lines);
  }

  add(text: string) {
    const trim = isMultilineString(text)
      ? (line: string) => line
      : (line: string) => line.trim();
    this._lines.push(...text.trim().split('\n').map(trim));
  }

  newLine() {
    this._lines.push('');
  }

  format(): string {
    let spaces = '';
    let previousLine = '';
    return this._lines
      .map((line: string) => {
        if (line === '') return line;
        if (line.startsWith('}') || line.startsWith(']'))
          spaces = spaces.substring(this._baseIndent.length);

        const extraSpaces = /^(for|while|if|try).*\(.*\)$/.test(previousLine)
          ? this._baseIndent
          : '';
        previousLine = line;

        const callCarryOver = line.startsWith('.set');
        line =
          spaces + extraSpaces + (callCarryOver ? this._baseIndent : '') + line;
        if (line.endsWith('{') || line.endsWith('['))
          spaces += this._baseIndent;
        return this._baseOffset + line;
      })
      .join('\n');
  }
}

function isMultilineString(text: string) {
  return text.match(/`[\S\s]*`/)?.[0].includes('\n');
}

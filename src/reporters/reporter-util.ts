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

import { fileURLToPath } from 'url';
import { resolve, sep } from 'path';
import { readFileSync } from 'fs';
import { inspect } from 'util';
import { gray } from 'kleur/colors';
import { codeFrameColumns } from '@babel/code-frame';
import StackUtils from 'stack-utils';
import { Location, StackFrame, TestError } from '../common_types';

const stackUtils = new StackUtils({ internals: StackUtils.nodeInternals() });

const SYNTHETICS_PATH = resolve(__dirname, '..', '..');
const PW_CORE_PATH = require.resolve('playwright-core');

function prepareStackFrame(line: string): StackFrame {
  const frame = stackUtils.parseLine(line);
  if (!frame) {
    return;
  }
  // ignore node internals
  if (frame.file?.startsWith('internal') || frame.file?.startsWith('node:')) {
    return;
  }

  // handle relative URLs
  let file = frame.file?.startsWith('file://')
    ? fileURLToPath(frame.file)
    : resolve(process.cwd(), frame.file);

  // ignore node_modules
  if (file.includes(`${sep}node_modules${sep}`)) {
    return;
  }

  // filter library and PW files
  if (!filterLibInternals(file)) {
    return;
  }

  // When we bundle the journeys, we store the absolute path of the journey
  // files and write the sourcemap relative to these files. When we try to
  // extract the sourcemap file location, the stacktrace will be relatively
  // resolved to these files which would be under `journeys` folder. So we strip
  // these extra `journeys` from the path to get the correct file location.
  if (frame.file?.includes('journeys/journeys')) {
    file = file.replace('journeys/journeys', 'journeys');
  }

  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
    function: frame.function,
  };
}

function filterLibInternals(file: string) {
  // To ignore filtering the stack trace on tests
  if (process.env.TEST_OVERRIDE) {
    return true;
  }
  if (file.startsWith(SYNTHETICS_PATH)) {
    return false;
  }
  // should have been filtered by node_modules, but just in case
  if (file.startsWith(PW_CORE_PATH)) {
    return false;
  }
}

function constructStackFromFrames(frames: StackFrame[]) {
  const stackLines: string[] = [];
  for (const frame of frames) {
    stackLines.push(
      `    at ${frame.function ? frame.function + ' ' : ''}(${frame.file}:${
        frame.line
      }:${frame.column})`
    );
  }
  return stackLines;
}

export function prepareError(error: Error) {
  const stack = error.stack;
  const lines = stack.split('\n');
  let startAt = lines.findIndex(line => line.startsWith('    at '));
  if (startAt === -1) {
    startAt = lines.length;
  }
  const message = lines.slice(0, startAt).join('\n');
  const stackLines = lines.slice(startAt);
  // figure out the location of the journey/step that throws the error and
  // correct stack line corresponding to that error
  const stackFrames: StackFrame[] = [];
  for (const line of stackLines) {
    const frame = prepareStackFrame(line);
    if (!frame || !frame.file) {
      continue;
    }
    stackFrames.push(frame);
  }

  let location: Location | undefined;
  if (stackFrames.length) {
    const frame = stackFrames[0];
    location = {
      file: frame.file,
      column: frame.column || 0,
      line: frame.line || 0,
    };
  }

  return {
    message,
    stack: constructStackFromFrames(stackFrames).join('\n'),
    location,
  };
}

export function highLightSource(location: Location): string {
  if (!location) {
    return;
  }

  try {
    const source = readFileSync(location.file, 'utf-8');
    const code = codeFrameColumns(
      source,
      { start: location },
      { highlightCode: true }
    );
    return code;
  } catch (_) {
    // ignore error
  }
}

// serializeError prefers receiving proper Errors, but since at runtime
// non Error exceptions can be thrown, it tolerates though. The
// redundant type Error | any expresses that.
export function serializeError(
  error: Error | any,
  highlightCode = true
): TestError {
  if (!(error instanceof Error) || !error.stack) {
    return { message: `thrown: ${inspect(error)}` };
  }

  const testErr: TestError = { message: error.message };
  const { message, stack, location } = prepareError(error);
  testErr.message = message;
  if (stack) {
    testErr.stack = stack;
  }
  if (location && highlightCode) {
    testErr.location = location;
    testErr.source = highLightSource(testErr.location);
  }
  return testErr;
}

export function renderError(error: TestError) {
  const summary = [];
  // push empty string to add a new line before rendering error
  summary.push('');
  summary.push(error.message);

  if (error.source) {
    summary.push('');
    summary.push(error.source);
  }

  if (error.stack) {
    summary.push('');
    summary.push(gray(error.stack));
  }
  summary.join('');

  return summary.join('\n');
}

// strip color codes and ansi escape codes
const ansiRegex = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|'),
  'g'
);
export function stripAnsiCodes(msg = '') {
  return msg.replace(ansiRegex, '');
}

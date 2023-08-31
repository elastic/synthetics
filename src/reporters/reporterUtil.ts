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

import { codeFrameColumns } from '@babel/code-frame';
import StackUtils from 'stack-utils';
import { fileURLToPath } from 'url';
import { resolve, sep } from 'path';
import { Location } from '../common_types';
import { readFileSync } from 'fs';

const stackUtils = new StackUtils({ internals: StackUtils.nodeInternals() });

function prepareStackLine(line: string): Location | undefined {
  const frame = stackUtils.parseLine(line);
  if (!frame) {
    return;
  }
  // ignore node internals
  if (frame.file?.startsWith('internal') || frame.file?.startsWith('node:')) {
    return;
  }

  // handle relative URLs
  const file = frame.file?.startsWith('file://')
    ? fileURLToPath(frame.file)
    : resolve(process.cwd(), frame.file);

  // ignore node_modules
  if (file.includes(`${sep}node_modules${sep}`)) {
    return;
  }

  return {
    file,
    line: frame.line || 0,
    column: frame.column || 0,
  };
}

export function prepareLocation(stack: string) {
  const lines = stack.split('\n');
  let startAt = lines.findIndex(line => line.startsWith('    at '));
  if (startAt === -1) startAt = lines.length;
  const message = lines.slice(0, startAt).join('\n');
  const stackLines = lines.slice(startAt);
  // figure out the location of the journey/step that throws the error and
  // correct stack line corresponding to that error
  let location: Location | undefined;
  let stackLine: string;
  for (const line of stackLines) {
    const frame = prepareStackLine(line);
    if (!frame || !frame.file) continue;
    stackLine = line;
    location = {
      file: frame.file,
      column: frame.column || 0,
      line: frame.line || 0,
    };
    break;
  }

  return {
    message,
    stackLine,
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
      {
        highlightCode: true,
      }
    );
    return code;
  } catch (_) {
    // ignore error
  }
}

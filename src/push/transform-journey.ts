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

import { transformFileAsync } from '@babel/core';
import type { PluginObj, types } from '@babel/core';

type JourneyPluginOptions = {
  name: string;
};

export function JourneyTransformPlugin(
  { types: t }: { types: typeof types },
  opts: JourneyPluginOptions
): PluginObj {
  return {
    name: 'transform-journeys',
    visitor: {
      CallExpression(path) {
        const { callee } = path.node;
        if (t.isIdentifier(callee) && callee.name === 'journey') {
          const args = path.node.arguments;
          if (!t.isStringLiteral(args[0])) {
            return;
          }
          if (args[0].value === opts.name) {
            path.skip();
          } else {
            path.parentPath.remove();
          }
        }
      },
    },
  };
}

export async function transform(absPath: string, journeyName: string) {
  return await transformFileAsync(absPath, {
    ast: false,
    retainLines: true,
    babelrc: false,
    configFile: false,
    plugins: [[JourneyTransformPlugin, { name: journeyName }]],
  });
}

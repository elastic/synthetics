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

import { join } from 'path';
import * as esbuild from 'esbuild';

// Source of the package - /src, /dist, etc.
const SOURCE_DIR = join(__dirname, '..');

/**
 * Avoid importing @elastic/synthetics package from source, this avoids
 * bundling the synthetics package in tests or when resolved using
 * absolute paths.
 * ex: import {journey} from "../../"
 */
const isLocalSynthetics = (resolvedPath: string) => {
  return resolvedPath.startsWith(SOURCE_DIR);
};

/**
 * Esbuild Plugin to create separate bundles for all the journeys.
 * Treats journeys as the entry point and bundles all the dependencies
 * including the node_modules and ignores bundling the synthetics package
 * when imported externally or from source.
 */
export function SyntheticsBundlePlugin(): esbuild.Plugin {
  return {
    name: 'synthetics-bundle-plugin',
    setup(build) {
      build.onResolve({ filter: /.*?/ }, async args => {
        // Ignore entry points as these refer to the journey files
        if (args.kind === 'entry-point') {
          return;
        }
        const resolvedPath = join(args.resolveDir, args.path);
        if (isLocalSynthetics(resolvedPath)) {
          return { external: true };
        }
        // Allow esbuild to resolve the module
        return;
      });
    },
  };
}

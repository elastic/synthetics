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

import path from 'path';
import fs from 'fs/promises';
import * as esbuild from 'esbuild';

export function commonOptions(): esbuild.BuildOptions {
  return {
    bundle: true,
    external: ['node_modules', '@elastic/synthetics'],
    minify: false,
    platform: 'node',
    format: 'esm',
    write: false,
    outExtension: {
      '.js': '.js',
    },
  };
}

export type PluginData = {
  path: string;
  contents: string;
};
export type PluginCallback = (data: PluginData) => void;

export function Plugin(callback: PluginCallback): esbuild.Plugin {
  const isBare = (str: string) => {
    if (str.startsWith('/') || str.startsWith('./') || str.startsWith('../')) {
      return true;
    }
    return false;
  };

  return {
    name: 'esbuild-multiasset-plugin',
    setup(build) {
      build.onResolve({ filter: /.*?/ }, async args => {
        // External and other packages need be marked external to
        // be removed from the bundle
        if (
          build.initialOptions.external?.includes(args.path) ||
          !isBare(args.path)
        ) {
          return {
            external: true,
          };
        }

        if (args.kind === 'entry-point') {
          return {
            path: args.path,
            namespace: 'asset',
          };
        }

        // If the modules are resolved locally, then
        // use the imported path to get full path
        const entryPath =
          path.join(path.dirname(args.importer), args.path) +
          path.extname(args.importer);
        // Spin off another build to copy over the imported modules without bundling
        const result = await esbuild.build({
          ...commonOptions(),
          entryPoints: {
            [entryPath]: entryPath,
          },
          bundle: false,
          external: [],
        });

        callback({
          path: entryPath,
          contents: result.outputFiles[0].text,
        });

        return {
          errors: result.errors,
          external: true,
        };
      });

      build.onLoad({ filter: /.*?/, namespace: 'asset' }, async args => {
        const contents = await fs.readFile(args.path, 'utf-8');
        callback({ path: args.path, contents });
        return { contents };
      });
    },
  };
}

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

import { isAbsolute, dirname, extname, join } from 'path';
import fs from 'fs/promises';
import * as esbuild from 'esbuild';

// ROOT directory of the Package - /
const ROOT_DIR = join(__dirname, '..', '..');
// Source of the package - /src, /dist, etc.
const SOURCE_DIR = join(__dirname, '..');
// Node modules directory of the package - /node_modules
const SOURCE_NODE_MODULES = join(ROOT_DIR, 'node_modules');

export function commonOptions(): esbuild.BuildOptions {
  return {
    bundle: true,
    external: ['@elastic/synthetics'],
    minify: false,
    minifyIdentifiers: false,
    minifySyntax: false,
    minifyWhitespace: false,
    treeShaking: false,
    keepNames: false,
    platform: 'node',
    logLevel: 'silent',
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

export function MultiAssetPlugin(callback: PluginCallback): esbuild.Plugin {
  // Check that the path isn't in an external package by making sure it's at a standard
  // local filesystem location
  const isBare = (str: string) => {
    // Note that we use `isAbsolute` to handle UNC/windows style paths like C:\path\to\thing
    // This is not necessary for relative directories since `.\file` is not supported as an import
    // nor is `~/path/to/file`.
    if (isAbsolute(str) || str.startsWith('./') || str.startsWith('../')) {
      return true;
    }
    return false;
  };

  // If we're importing the @elastic/synthetics package
  // directly from source instead of using the fully
  // qualified name, we must skip it too. That's just
  // so it doesn't get bundled on tests or when we locally
  // refer to the package itself.
  const isLocalSynthetics = (entryPath: string) => {
    return entryPath.startsWith(SOURCE_DIR);
  };

  // When importing the local synthetics module directly
  // it may import its own local dependencies, so we must
  // make sure those will be resolved using Node's resolution
  // algorithm, as they're still "node_modules" that we must bundle
  const isLocalSyntheticsModule = (str: string) => {
    return str.startsWith(SOURCE_NODE_MODULES);
  };

  return {
    name: 'esbuild-multiasset-plugin',
    setup(build) {
      build.onResolve({ filter: /.*?/ }, async args => {
        // External and other packages need be marked external to
        // be removed from the bundle
        if (build.initialOptions.external?.includes(args.path)) {
          return {
            external: true,
          };
        }

        if (
          !isBare(args.path) ||
          args.importer.includes('/node_modules/') ||
          isLocalSyntheticsModule(args.importer)
        ) {
          return;
        }

        if (args.kind === 'entry-point') {
          return {
            path: args.path,
            namespace: 'journey',
          };
        }

        // If the modules are resolved locally, then
        // use the imported path to get full path
        const entryPath =
          join(dirname(args.importer), args.path) + extname(args.importer);

        if (isLocalSynthetics(entryPath)) {
          return { external: true };
        }

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

      build.onLoad({ filter: /.*?/, namespace: 'journey' }, async args => {
        const contents = await fs.readFile(args.path, 'utf-8');
        callback({ path: args.path, contents });

        // Use correct loader for the journey entry path
        let loader: esbuild.Loader = 'default';
        const ext = extname(args.path).slice(1);
        if (ext === 'cjs' || ext === 'mjs') {
          loader = 'js';
        } else if (ext === 'cts' || ext === 'mts') {
          loader = 'ts';
        } else {
          loader = ext as esbuild.Loader;
        }
        return { contents, loader };
      });
    },
  };
}

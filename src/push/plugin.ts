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
import { readFile } from 'fs/promises';
import * as esbuild from 'esbuild';
import NodeResolvePlugin from '@esbuild-plugins/node-resolve';

// ROOT directory of the Package - /
const ROOT_DIR = join(__dirname, '..', '..');
// Source of the package - /src, /dist, etc.
const SOURCE_DIR = join(ROOT_DIR, 'src');
const DIST_DIR = join(ROOT_DIR, 'dist');
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
    logLevel: 'error',
    platform: 'node',
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

// Check that the path isn't in an external package by making sure it's at a standard
// local filesystem location
export const isBare = (str: string) => {
  if (str.startsWith('./') || str.startsWith('../')) {
    return true;
  }
  return false;
};

// Avoid importing @elastic/synthetics package from source
const isLocalSynthetics = (entryPath: string) => {
  return entryPath.startsWith(SOURCE_DIR) || entryPath.startsWith(DIST_DIR);
};

// Avoid importing the local dependenceis of the @elastic/synthetics module
// from source
const isLocalSyntheticsModule = (str: string) => {
  return str.startsWith(SOURCE_NODE_MODULES);
};

export function SyntheticsBundlePlugin(
  callback: PluginCallback,
  external: string[]
): esbuild.Plugin {
  const visited = new Set<string>();

  return NodeResolvePlugin({
    name: 'SyntheticsBundlePlugin',
    extensions: ['.ts', '.js', '.mjs'],
    onNonResolved: (_, __, error) => {
      throw error;
    },
    onResolved: async resolved => {
      if (
        external.includes(resolved) ||
        isLocalSynthetics(resolved) ||
        isLocalSyntheticsModule(resolved)
      ) {
        return {
          external: true,
        };
      }

      if (visited.has(resolved)) {
        return;
      }

      // Spin off another build to copy over the imported modules without bundling
      if (resolved.includes('/node_modules/')) {
        const result = await esbuild.build({
          ...commonOptions(),
          entryPoints: [resolved],
          bundle: false,
          external: [],
        });

        callback({
          path: resolved,
          contents: result.outputFiles[0].text,
        });
      } else {
        // If it's a local file, read it and return the contents
        // to preserve the source without modifications
        try {
          const contents = await readFile(resolved, 'utf-8');
          callback({ path: resolved, contents });
        } catch (e) {
          throw new Error(`Could not read file ${resolved}`);
        }
      }
      visited.add(resolved);
      return;
    },
  });
}

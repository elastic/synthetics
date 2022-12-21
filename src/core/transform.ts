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

import { addHook } from 'pirates';
import {
  transformSync,
  Loader,
  CommonOptions,
  TransformOptions,
} from 'esbuild';
import path from 'path';
import sourceMapSupport from 'source-map-support';

// Cache that holds the sourcemap content for each file
const sourceMaps: Map<string, string> = new Map();

// Register the source-map-support library to resolve the sourcemaps
// for the files that are transpiled by esbuild
sourceMapSupport.install({
  environment: 'node',
  handleUncaughtExceptions: false,
  retrieveSourceMap(source) {
    if (!sourceMaps.has(source)) return null;
    return {
      map: JSON.parse(sourceMaps.get(source)),
      url: source,
    };
  },
});

const LOADERS: Record<string, Loader> = {
  '.ts': 'ts',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
};

const getLoader = (filename: string) => {
  const ext = path.extname(filename);
  return LOADERS[ext] || 'default';
};

export function commonOptions(): CommonOptions {
  return {
    minify: false,
    minifyIdentifiers: false,
    minifySyntax: false,
    minifyWhitespace: false,
    sourcemap: 'both',
    sourcesContent: false,
    platform: 'node',
    logLevel: 'silent',
    format: 'cjs',
    target: `node${process.version.slice(1)}`,
  };
}

export function transform(
  code: string,
  filename: string,
  options: TransformOptions = {}
) {
  const result = transformSync(code, {
    ...commonOptions(),
    sourcefile: filename,
    loader: getLoader(filename),
    /**
     * Add this only for the transformation phase, using it on
     * bundling phase would disable tree shaking and uncessary bloat
     *
     * Ensures backwards compatability with tsc's implicit strict behaviour
     */
    tsconfigRaw: {
      compilerOptions: {
        alwaysStrict: true,
      },
    },
    ...options,
  });

  const warnings = result.warnings;
  if (warnings && warnings.length > 0) {
    for (const warning of warnings) {
      console.log(warning.location);
      console.log(warning.text);
    }
  }

  /**
   * Cache the sourcemap contents in memory, so we can look it up
   * later when we try to resolve the sourcemap for a given file
   */
  if (result.map) {
    sourceMaps.set(filename, result.map);
  }
  return result;
}

export function installTransform() {
  const revertPirates = addHook(
    (source: string, filename: string) => {
      const { code } = transform(source, filename);
      return code;
    },
    { exts: ['.ts', '.js', '.mjs', '.cjs'] }
  );

  return () => {
    revertPirates();
  };
}

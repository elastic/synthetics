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

/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const esbuild = require('esbuild');
const { ENTRY_POINTS } = require('./src');

const outdir = path.join(__dirname, '..', 'dist', 'bundles');

(async () => {
  const ctx = await esbuild.context({
    entryPoints: ENTRY_POINTS,
    bundle: true,
    external: ['playwright-core', '@playwright/test/lib/transform/esmLoader'],
    outfile: path.join(outdir, 'lib', 'index.js'),
    format: 'cjs',
    platform: 'node',
    target: `node${process.version.slice(1)}`,
    minify: process.argv.includes('--minify'),
    sourcemap: process.argv.includes('--sourcemap'),
    sourcesContent: false,
  });
  await ctx.rebuild();
  await ctx.dispose();
})().catch(error => {
  console.error(error);
  process.exit(1);
});

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

const path = require('path');
const esbuild = require('esbuild');

const outdir = path.join(__dirname, '..', 'dist', 'bundles');

function IgnorePlugin() {
  return {
    name: 'ignore-plugin',
    setup(build) {
      build.onResolve({ filter: /.(json|node)$/ }, async () => {
        return {
          external: true,
        };
      });
    },
  };
}

(async () => {
  const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'index.ts')],
    bundle: true,
    external: ['playwright-core'],
    outfile: path.join(outdir, 'lib', 'index.js'),
    format: 'cjs',
    logLevel: 'silent',
    platform: 'node',
    plugins: [IgnorePlugin()],
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

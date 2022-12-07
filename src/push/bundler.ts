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
import { stat, unlink, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import * as esbuild from 'esbuild';
import archiver from 'archiver';
import { builtinModules } from 'module';
import {
  commonOptions,
  isBare,
  SyntheticsBundlePlugin,
  PluginData,
} from './plugin';

const SIZE_LIMIT_KB = 800;
const BUNDLES_PATH = 'bundles';
const EXTERNAL_MODULES = ['@elastic/synthetics'];

function relativeToCwd(entry: string) {
  return path.relative(process.cwd(), entry);
}

export class Bundler {
  private moduleMap = new Map<string, string>();

  async prepare(absPath: string) {
    const addToMap = (data: PluginData) => {
      const bundlePath = this.getModulesPath(data.path);
      this.moduleMap.set(bundlePath, data.contents);
    };

    const options: esbuild.BuildOptions = {
      ...commonOptions(),
      ...{
        entryPoints: {
          [absPath]: absPath,
        },
        plugins: [SyntheticsBundlePlugin(addToMap, EXTERNAL_MODULES)],
      },
    };
    const result = await esbuild.build(options);
    if (result.errors.length > 0) {
      throw result.errors;
    }
  }

  resolvePath(bundlePath: string) {
    for (const mod of this.moduleMap.keys()) {
      if (mod.startsWith(bundlePath)) {
        return mod.substring(0, mod.lastIndexOf(path.extname(mod)));
      }
    }
    return null;
  }

  /**
   * Rewrite the imports/requires to local node modules dependency
   * to relative paths that references the bundles directory
   */
  rewriteImports(
    contents: string,
    bundlePath: string,
    external: string[] = EXTERNAL_MODULES
  ) {
    const packageRegex =
      /s*(from|require\()\s*(['"`][^'"`]+['"`])(?=;?)(?=([^"'`]*["'`][^"'`]*["'`])*[^"'`]*$)/gi;

    return contents.replace(packageRegex, (raw, _, dep) => {
      dep = dep.replace(/['"`]/g, '');
      // Ignore rewriting for built-in modules, ignored modules and bare modules
      if (
        builtinModules.includes(dep) ||
        external.includes(dep) ||
        isBare(dep)
      ) {
        return raw;
      }
      // If the module is not in node_modules, we need to go up the directory
      // tree till we reach the bundles directory
      let deep = bundlePath.split(path.sep).length;
      let resolvedpath = this.resolvePath(BUNDLES_PATH + '/' + dep);
      // If its already part of the bundles directory, we don't need to go up
      if (bundlePath.startsWith(BUNDLES_PATH)) {
        deep -= 1;
        resolvedpath = resolvedpath.replace(BUNDLES_PATH + '/', '');
      }
      return raw.replace(dep, '.'.repeat(deep) + '/' + resolvedpath);
    });
  }

  getModulesPath(path: string) {
    const relativePath = relativeToCwd(path);
    if (relativePath.startsWith('node_modules')) {
      return relativePath.replace('node_modules', BUNDLES_PATH);
    }
    return relativePath;
  }

  async zip(outputPath: string) {
    return new Promise((fulfill, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 },
      });
      archive.on('error', reject);
      output.on('close', fulfill);
      archive.pipe(output);
      for (const [path, contents] of this.moduleMap.entries()) {
        // Rewrite the imports to relative paths
        archive.append(this.rewriteImports(contents, path), {
          name: path,
          // Date is fixed to Unix epoch so the file metadata is
          // not modified everytime when files are bundled
          date: new Date('1970-01-01'),
        });
      }
      archive.finalize();
    });
  }

  async build(entry: string, output: string) {
    await this.prepare(entry);
    await this.zip(output);
    const data = await this.encode(output);
    await this.checkSize(output);
    await this.cleanup(output);
    return data;
  }

  async encode(outputPath: string) {
    return await readFile(outputPath, 'base64');
  }

  async checkSize(outputPath: string) {
    const { size } = await stat(outputPath);
    const sizeKb = size / 1024;
    if (sizeKb > SIZE_LIMIT_KB) {
      throw new Error(
        `You have monitors whose size exceeds the ${SIZE_LIMIT_KB}KB limit.`
      );
    }
  }

  async cleanup(outputPath: string) {
    this.moduleMap = new Map<string, string>();
    await unlink(outputPath);
  }
}

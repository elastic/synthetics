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

import path, { normalize } from 'path';
import { stat, unlink, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import * as esbuild from 'esbuild';
import archiver from 'archiver';
import { builtinModules } from 'module';
import {
  commonOptions,
  EXTERNAL_MODULES,
  isBare,
  SyntheticsBundlePlugin,
  PluginData,
} from './plugin';
import { lcaTwoPaths } from './utils';

const SIZE_LIMIT_KB = 800;
const BUNDLES_PATH = 'bundles';

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
        plugins: [SyntheticsBundlePlugin(addToMap)],
      },
    };
    const result = await esbuild.build(options);
    if (result.errors.length > 0) {
      throw result.errors;
    }
  }

  resolvePath(bundlePath: string) {
    for (const mod of this.moduleMap.keys()) {
      if (mod.includes(bundlePath)) {
        return mod.substring(0, mod.lastIndexOf(path.extname(mod)));
      }
    }
    throw new Error(`Could not find bundled code for ${bundlePath}`);
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
      // Resolve the path to the module from the bundles directory
      let resolvedpath = this.resolvePath(BUNDLES_PATH + '/' + dep);
      // Take LCA to find the relative path
      const LCAPath = lcaTwoPaths(bundlePath, resolvedpath);
      resolvedpath = resolvedpath.replace(LCAPath, '');
      bundlePath = bundlePath.replace(LCAPath, '');
      // Calculate the depth of the relative path to the module
      const depth = bundlePath.split(path.sep).filter(Boolean).length - 1;

      // Resolve the path to the module from the bundles directory
      let pathToModule = '';
      if (depth === 0) {
        pathToModule =
          './' +
          (resolvedpath.charAt(0) === '/'
            ? resolvedpath.substring(1)
            : resolvedpath);
      } else {
        pathToModule = normalize('../'.repeat(depth) + resolvedpath);
      }
      return raw.replace(dep, pathToModule);
    });
  }

  getModulesPath(path: string) {
    const relativePath = relativeToCwd(path);
    if (relativePath.includes('node_modules')) {
      return relativePath.replaceAll('node_modules', BUNDLES_PATH);
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

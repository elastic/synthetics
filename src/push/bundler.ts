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
import { commonOptions } from '../core/transform';
import { SyntheticsBundlePlugin } from './plugin';

const SIZE_LIMIT_KB = 800;

function relativeToCwd(entry: string) {
  return path.relative(process.cwd(), entry);
}

export class Bundler {
  moduleMap = new Map<string, string>();
  constructor() {}

  async prepare(absPath: string) {
    const options: esbuild.BuildOptions = {
      ...commonOptions(),
      ...{
        entryPoints: [absPath],
        bundle: true,
        write: false,
        sourcemap: 'inline',
        external: ['@elastic/synthetics'],
        plugins: [SyntheticsBundlePlugin()],
      },
    };
    const result = await esbuild.build(options);
    if (result.errors.length > 0) {
      throw result.errors;
    }
    this.moduleMap.set(absPath, result.outputFiles[0].text);
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
      for (const [path, content] of this.moduleMap.entries()) {
        const relativePath = relativeToCwd(path);
        // Date is fixed to Unix epoch so the file metadata is
        // not modified everytime when files are bundled
        archive.append(content, {
          name: relativePath,
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

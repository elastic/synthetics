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
import { readFile, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import * as esbuild from 'esbuild';
import archiver from 'archiver';
import { commonOptions } from '../core/transform';
import { SyntheticsBundlePlugin } from './plugin';

function relativeToCwd(entry: string) {
  return path.relative(process.cwd(), entry);
}

export class Bundler {
  async bundle(absPath: string) {
    const assets: { [key: string]: Uint8Array } = {}; // Store asset files
    const assetPlugin: esbuild.Plugin = {
      name: 'asset-plugin',
      setup(build) {
        build.onLoad(
          {
            filter:
              /\.(pdf|docx?|odt|csv|xlsx?|png|jpe?g|gif|webp|zip|tar\.gz|rar|7z|txt|log|json|xml|mp3|wav|mp4|avi|webm)$/,
          },
          async args => {
            const content = await readFile(args.path, 'utf-8'); // Read file contents as text
            assets[args.path] = await readFile(args.path);
            return {
              contents: `export default ${JSON.stringify(content)};`,
              loader: 'text',
            };
          }
        );
      },
    };
    const options: esbuild.BuildOptions = {
      ...commonOptions(),
      ...{
        entryPoints: [absPath],
        bundle: true,
        write: false,
        minifyWhitespace: true,
        sourcemap: 'inline',
        external: ['@elastic/synthetics'],
        plugins: [SyntheticsBundlePlugin(), assetPlugin],
      },
    };
    const result = await esbuild.build(options);
    if (result.errors.length > 0) {
      throw result.errors;
    }
    return { code: result.outputFiles[0].text, assets };
  }

  async zip(
    source: string,
    code: string,
    dest: string,
    assets: { [key: string]: Uint8Array }
  ) {
    return new Promise((fulfill, reject) => {
      const output = createWriteStream(dest);
      const archive = archiver('zip', {
        zlib: { level: 9 },
      });
      archive.on('error', reject);
      output.on('close', fulfill);
      archive.pipe(output);
      const relativePath = relativeToCwd(source);
      // Date is fixed to Unix epoch so the file metadata is
      // not modified everytime when files are bundled
      archive.append(code, {
        name: relativePath,
        date: new Date('1970-01-01'),
      });

      // Add asset files
      for (const [filePath, content] of Object.entries(assets)) {
        const assetRelativePath = relativeToCwd(filePath);
        archive.append(content, {
          name: assetRelativePath,
          date: new Date('1970-01-01'),
        });
      }

      archive.finalize();
    });
  }

  async build(entry: string, output: string) {
    const { code, assets } = await this.bundle(entry);
    await this.zip(entry, code, output, assets);
    const content = await this.encode(output);
    await this.cleanup(output);
    return content;
  }

  async encode(outputPath: string) {
    return await readFile(outputPath, 'base64');
  }

  async cleanup(outputPath: string) {
    await unlink(outputPath);
  }
}

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

import { execFileSync, spawn } from 'child_process';
import { rm, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { tmpdir } from 'os';
import { Extract } from 'unzip-stream';
import { red } from 'kleur/colors';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { MonitorSchema } from './monitor';

async function unzipFile(zipPath, destination) {
  return new Promise<void>((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(Extract({ path: destination }))
      .on('close', resolve)
      .on('error', err =>
        reject(new Error(`failed to extract zip ${zipPath} : ${err.message}`))
      );
  });
}

async function runNpmInstall(directory) {
  return new Promise<void>((resolve, reject) => {
    const flags = [
      '--no-audit', // Prevent audit checks
      '--no-update-notifier', // Prevent update checks
      '--no-fund', // No need for package funding messages here
      '--package-lock=false', // no need to write package lock here
      '--progress=false', // no need to display progress
    ];

    const npmInstall = spawn('npm', ['install', ...flags], {
      cwd: directory,
      stdio: 'ignore',
    });
    npmInstall.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with exit code ${code}`));
      }
    });
    npmInstall.on('error', err =>
      reject(new Error(`failed to setup: ${err.message}`))
    );
  });
}

async function runTest(directory, schema: MonitorSchema) {
  return new Promise<void>((resolve, reject) => {
    const runTest = spawn(
      'npx',
      [
        '@elastic/synthetics',
        '.',
        '--playwright-options',
        JSON.stringify(schema.playwrightOptions),
        '--params',
        JSON.stringify(schema.params),
      ],
      {
        cwd: directory,
        stdio: 'inherit',
      }
    );

    runTest.on('close', resolve);
    runTest.on('error', err => {
      reject(
        new Error(`Failed to execute @elastic/synthetics : ${err.message}`)
      );
    });
  });
}

async function writePkgJSON(dir: string, synthPath: string) {
  const packageJsonContent = {
    name: 'project-journey',
    private: 'true',
    dependencies: {
      '@elastic/synthetics': pathToFileURL(synthPath),
    },
  };
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify(packageJsonContent, null, 2),
    'utf-8'
  );
}

async function extract(
  schema: MonitorSchema,
  zipPath: string,
  unzipPath: string
) {
  if (schema.type !== 'browser') {
    return;
  }
  const content = schema.content;
  await writeFile(zipPath, content, 'base64');
  await unzipFile(zipPath, unzipPath);
}

export async function runLocal(schemas: MonitorSchema[]) {
  // lookup installed bin path of a node module
  const resolvedPath = execFileSync('which', ['elastic-synthetics'], {
    encoding: 'utf8',
  }).trim();
  const synthPath = resolvedPath.replace(
    join('bin', 'elastic-synthetics'),
    join('lib', 'node_modules', '@elastic/synthetics')
  );
  const rand = Date.now();
  const zipPath = join(tmpdir(), `synthetics-zip-${rand}.zip`);
  const unzipPath = join(tmpdir(), `synthetics-unzip-${rand}`);
  try {
    for (const schema of schemas) {
      await extract(schema, zipPath, unzipPath);
    }
    await writePkgJSON(unzipPath, synthPath);
    await runNpmInstall(unzipPath);
    // TODO: figure out a way to collect all params and Playwright options
    await runTest(unzipPath, schemas[0]);
  } catch (e) {
    throw red(`Aborted: ${e.message}`);
  } finally {
    await rm(zipPath, { recursive: true, force: true });
    await rm(unzipPath, { recursive: true, force: true });
  }
}

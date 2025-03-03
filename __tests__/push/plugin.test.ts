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

import * as esbuild from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import AdmZip from 'adm-zip';
import { commonOptions } from '../../src/core/transform';
import { SyntheticsBundlePlugin } from '../../src/push/plugin';
import { Bundler } from '../../src/push/bundler';

describe('SyntheticsBundlePlugin', () => {
  const PROJECT_DIR = join(__dirname, 'test-bundler');
  const journeyFile = join(PROJECT_DIR, 'bundle.journey.ts');

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true });
  });

  it('skip locally resolved synthetics package', async () => {
    // Should
    await writeFile(
      journeyFile,
      `import {journey, step, monitor} from '../../';
journey('journey 1', () => {
  monitor.use({ id: 'duplicate id' });
  step("step1", () => {})
});`
    );
    const result = await esbuild.build({
      ...commonOptions(),
      bundle: false,
      sourcemap: false,
      write: false,
      entryPoints: [journeyFile],
      plugins: [SyntheticsBundlePlugin()],
    });
    expect(result.outputFiles[0].text).toMatchSnapshot();
  });
});

describe('Asset Plugin', () => {
  const PROJECT_DIR = join(__dirname, 'test-assets');
  const journeyFile = join(PROJECT_DIR, 'bundle.journey.ts');
  const assetFile = join(PROJECT_DIR, 'sample.pdf');
  const zipOutput = join(PROJECT_DIR, 'output.zip');
  const csvFile = join(PROJECT_DIR, 'sample.csv');
  const assetContent = 'This is a test PDF file';

  beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });

    // Create a sample asset file
    await writeFile(assetFile, assetContent);

    // Create a journey file that imports the asset
    await writeFile(
      journeyFile,
      `import pdfPath from './sample.pdf';
console.log("PDF file path:", pdfPath);`
    );
  });

  afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  it('should include imported assets in the bundle', async () => {
    const assets: { [key: string]: Uint8Array } = {};

    const assetPlugin: esbuild.Plugin = {
      name: 'asset-plugin',
      setup(build) {
        build.onLoad({ filter: /\.(pdf|xlsx?|csv)$/ }, async args => {
          assets[args.path] = await readFile(args.path);
          return {
            contents: `export default ${JSON.stringify(args.path)};`, // Keep path reference
            loader: 'text',
          };
        });
      },
    };

    const result = await esbuild.build({
      bundle: true,
      sourcemap: false,
      write: false,
      entryPoints: [journeyFile],
      plugins: [assetPlugin],
    });

    expect(result.outputFiles).toBeDefined();
    expect(Object.keys(assets)).toContain(assetFile);

    // Ensure the asset is referenced in the output
    const bundleText = result.outputFiles[0].text;
    expect(bundleText).toContain('push/test-assets/sample.pdf');
  });

  it('should bundle, zip, and contain the correct pdf asset content', async () => {
    const bundler = new Bundler();
    // Build & zip
    const base64Zip = await bundler.build(journeyFile, zipOutput);
    await mkdir(PROJECT_DIR + '/zip/', { recursive: true });

    const zipPath = join(PROJECT_DIR, '/zip/test-output.zip');

    // Convert Base64 back to a ZIP file
    await writeFile(zipPath, Buffer.from(base64Zip, 'base64'));

    // Read the generated ZIP file
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries().map(entry => entry.entryName);

    // Check that the asset is included in the ZIP archive
    expect(zipEntries).toEqual([
      '__tests__/push/test-assets/bundle.journey.ts',
      '__tests__/push/test-assets/sample.pdf',
    ]);

    // Extract and verify asset content
    const extractedAsset = zip.readAsText(
      '__tests__/push/test-assets/sample.pdf'
    );
    expect(extractedAsset).toBe(assetContent);
  });

  it('should bundle, zip, and contain the correct csv asset content', async () => {
    await writeFile(
      journeyFile,
      `
    import sampleCsv from './sample.csv';
    console.log("CSV file path:", sampleCsv);
  `
    );
    await writeFile(csvFile, `id,name\n1,Test User\n2,Another User`);
    const bundler = new Bundler();
    // Build & zip
    const base64Zip = await bundler.build(journeyFile, zipOutput);
    await mkdir(PROJECT_DIR + '/zip/', { recursive: true });

    const zipPath = join(PROJECT_DIR, '/zip/test-output.zip');

    // Convert Base64 back to a ZIP file
    await writeFile(zipPath, Buffer.from(base64Zip, 'base64'));

    // Read the generated ZIP file
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries().map(entry => entry.entryName);

    // Check that the asset is included in the ZIP archive
    expect(zipEntries).toEqual([
      '__tests__/push/test-assets/bundle.journey.ts',
      '__tests__/push/test-assets/sample.csv',
    ]);

    // Extract and verify asset content
    const extractedAsset = zip.readAsText(
      '__tests__/push/test-assets/sample.csv'
    );
    expect(extractedAsset).toBe(`id,name\n1,Test User\n2,Another User`);
  });
});

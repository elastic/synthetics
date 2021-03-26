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

import { spawn } from 'child_process';
import { wsEndpoint } from './test-config';

module.exports = async () => {
  if (wsEndpoint) {
    return new Promise((resolve, reject) => {
      console.log(`\nRunning BrowserService ${wsEndpoint}`);
      const browserServiceProcess = spawn(
        'node',
        ['./dist/run-browser-service.js'],
        { env: { ...process.env, DEBUG: 'true' } }
      );
      (global as any).__browserServiceProcess = browserServiceProcess;
      browserServiceProcess.stdout.on('data', data => {
        if (data.indexOf('Listening on port: 9322') >= 0) {
          resolve(browserServiceProcess);
        }
      });

      browserServiceProcess.stderr.on('data', data => {
        const message = `BrowserService: ${data}`;
        browserServiceProcess.kill();
        reject(message);
      });
    });
  } else {
    console.log(`\nRunning without BrowserService`);
  }
};

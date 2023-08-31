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
const { spawnSync } = require('child_process');
const { join } = require('path');
const { cyan } = require('kleur/colors');

const ROOT_DIR = join(__dirname, '..');
/**
 * @typedef {{
 *   cmd: string,
 *   args: string[],
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string,
 * }} Script
 */

/** @type {Script[]} */
const scripts = [];

// bundles
const BUNDLES_DIR = join(ROOT_DIR, 'bundles');

scripts.push({
  cmd: 'npm',
  args: ['ci', '--no-fund', '--no-audit', '--no-save'],
  cwd: BUNDLES_DIR,
});

scripts.push({
  cmd: 'npm',
  args: ['run', 'build'],
  cwd: BUNDLES_DIR,
});

// test-runner
scripts.push({
  cmd: 'npm',
  args: ['run', 'build:lib'],
});

function runBuild() {
  for (const script of scripts) {
    console.log(
      cyan(
        `Running '${script.cmd} ${script.args.join(' ')}' in ${
          script.cwd || process.cwd()
        }`
      )
    );
    const out = spawnSync(script.cmd, script.args, {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        ...script.env,
      },
      cwd: script.cwd,
    });
    if (out.status > 0) process.exit(out.status);
  }
}

runBuild();

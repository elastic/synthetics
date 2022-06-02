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

import { ChildProcess, spawn } from 'child_process';
import { join } from 'path';
import { Monitor } from '../../dist/dsl/monitor';

export const wsEndpoint = process.env.WSENDPOINT;

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
export function createTestMonitor(filename: string) {
  const monitor = new Monitor({
    id: 'test-monitor',
    name: 'test',
    schedule: 10,
    enabled: true,
    locations: ['Europe - United Kingdom', 'Asia/Pacific - Australia East'],
  });
  monitor.setSource({
    file: join(FIXTURES_DIR, filename),
    line: 0,
    column: 0,
  });
  monitor.setFilter({ match: 'test' });
  return monitor;
}

export class CLIMock {
  private process: ChildProcess;
  private data = '';
  private chunks: Array<string> = [];
  private waitForText: string;
  private waitForPromise: () => void;
  private cliArgs: string[] = [];
  private stdinStr?: string;
  private stderrStr: string;
  exitCode: Promise<number>;

  constructor(public debug: boolean = false) {}

  args(a: string[]): CLIMock {
    this.cliArgs.push(...a);
    // Screenshots is `on` by default in CLI, so we
    // disable it for all tests, unless enabled explicity
    if (!(a.includes('--rich-events') || a.includes('--screenshots'))) {
      this.cliArgs.push('--screenshots', 'off');
    }
    return this;
  }

  stdin(s: string): CLIMock {
    this.stdinStr = s;
    return this;
  }

  run(spawnOverrides?: { cwd?: string }): CLIMock {
    this.process = spawn(
      'node',
      [join(__dirname, '..', '..', 'dist', 'cli.js'), ...this.cliArgs],
      {
        env: process.env,
        stdio: 'pipe',
        ...spawnOverrides,
      }
    );

    if (this.stdinStr) {
      this.process.stdin.setDefaultEncoding('utf8');
      this.process.stdin.write(this.stdinStr);
      this.process.stdin.end();
    }

    const dataListener = data => {
      this.data = data.toString();
      if (this.debug) {
        console.log('CLIMock.stdout:', this.data);
      }
      this.chunks.push(this.data);
      if (this.waitForPromise && this.data.includes(this.waitForText)) {
        this.process.stdout.off('data', dataListener);
        this.waitForPromise();
      }
    };
    this.process.stdout.on('data', dataListener);

    this.exitCode = new Promise(res => {
      this.process.stderr.on('data', data => {
        this.stderrStr += data;
        if (this.debug) {
          console.log('CLIMock.stderr:', data.toString());
        }
      });
      this.process.on('exit', code => res(code));
    });

    return this;
  }

  async waitFor(text: string): Promise<void> {
    this.waitForText = text;
    return new Promise(r => (this.waitForPromise = r));
  }

  output() {
    return this.data;
  }

  buffer() {
    // Merge all the interleaved chunks from stdout and
    // split them on new line as synthetics runner writes the
    // JSON output in separate lines for every event.
    return this.chunks.join('').split('\n').filter(Boolean);
  }

  stderr() {
    return this.stderrStr.toString();
  }
}

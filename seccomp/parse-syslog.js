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
const fs = require('fs');
const syscallTable = require('./x86_64_table.json');

const syslogFile = process.argv[2] || './syslog';

console.log(`# Seccomp profile generated from ${syslogFile}`);
console.log(`
seccomp:
  default_action: errno
  syscalls:
`);
const data = fs.readFileSync(syslogFile, 'UTF-8');
const lines = data.split(/\r?\n/);

const parseLine = line => {
  const tuples = line.split(' ');
  const log = {};
  tuples.forEach(tuple => {
    const parts = tuple.split('=');
    log[parts[0]] = parts[1];
  });
  return log;
};

const seccomp = {};

lines.forEach(line => {
  const { syscall, exe } = parseLine(line);
  if (syscall && exe) {
    if (!seccomp[exe]) {
      seccomp[exe] = {};
    }
    if (!seccomp[exe][syscall]) {
      seccomp[exe][syscall] = syscallTable[syscall] || syscall;
    }
  }
});

for (const key in seccomp) {
  if (seccomp.hasOwnProperty(key)) {
    const syscalls = seccomp[key];
    console.log(`  - \n  # ${key}`);
    console.log(`    action: allow`);
    console.log(`    names:`);
    for (const k in syscalls) {
      if (syscalls.hasOwnProperty(k)) {
        const syscall = syscalls[k];
        console.log(`    - ${syscall} #${k}`);
      }
    }
  }
}

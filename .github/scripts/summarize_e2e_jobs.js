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

const TEST_JOB = /^test \((.+)\)$/;

function compareVersions(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function summarizeTestJobs(jobs) {
  const passed = [];
  const failed = [];

  for (const job of jobs) {
    const match = TEST_JOB.exec(job.name);
    if (!match) continue;
    if (job.conclusion === 'success') {
      passed.push(match[1]);
    } else {
      failed.push(match[1]);
    }
  }

  passed.sort(compareVersions);
  failed.sort(compareVersions);
  return { passed, failed };
}

function formatVersionList(versions) {
  return versions.map(version => `\`${version}\``).join(', ');
}

function formatSlackMessage({ passed, failed, ref, eventName, runNumber, runUrl }) {
  const ok = failed.length === 0 && passed.length > 0;
  const lines = [
    `${ok ? ':white_check_mark:' : ':x:'} *e2e ${
      ok ? 'passed' : 'failed'
    }* on \`${ref}\` (\`${eventName}\`) — <${runUrl}|#${runNumber}>`,
    '',
  ];

  if (passed.length) lines.push(`*Passed:* ${formatVersionList(passed)}`);
  if (failed.length) lines.push(`*Failed:* ${formatVersionList(failed)}`);
  if (!passed.length && !failed.length) lines.push('No version jobs ran.');

  return lines.join('\n');
}

module.exports = { summarizeTestJobs, formatSlackMessage };

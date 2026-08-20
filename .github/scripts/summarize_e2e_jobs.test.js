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

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeTestJobs,
  formatSlackMessage,
} = require('./summarize_e2e_jobs');

const runMeta = {
  ref: 'main',
  eventName: 'schedule',
  runNumber: 1299,
  runUrl:
    'https://github.com/elastic/synthetics/actions/runs/32009079908/attempts/1',
};

describe('summarizeTestJobs', () => {
  it('splits matrix versions into passed and failed', () => {
    const summary = summarizeTestJobs([
      { name: 'prepare', conclusion: 'success' },
      { name: 'test (9.5.0)', conclusion: 'failure' },
      { name: 'test (8.19.19)', conclusion: 'success' },
      { name: 'test (9.6.0-SNAPSHOT)', conclusion: 'cancelled' },
      { name: 'notify', conclusion: 'success' },
    ]);

    assert.deepEqual(summary, {
      passed: ['8.19.19'],
      failed: ['9.5.0', '9.6.0-SNAPSHOT'],
    });
  });

  it('returns empty lists when no version jobs ran', () => {
    assert.deepEqual(summarizeTestJobs([{ name: 'prepare', conclusion: 'failure' }]), {
      passed: [],
      failed: [],
    });
  });
});

describe('formatSlackMessage', () => {
  it('summarizes an all-green run', () => {
    assert.equal(
      formatSlackMessage({
        passed: ['8.19.19', '9.4.4'],
        failed: [],
        ...runMeta,
      }),
      [
        ':white_check_mark: *e2e passed* on `main` (`schedule`) — <https://github.com/elastic/synthetics/actions/runs/32009079908/attempts/1|#1299>',
        '',
        '*Passed:* `8.19.19`, `9.4.4`',
      ].join('\n')
    );
  });

  it('lists passed and failed versions', () => {
    assert.equal(
      formatSlackMessage({
        passed: ['8.19.19', '9.4.4'],
        failed: ['9.5.0'],
        ...runMeta,
      }),
      [
        ':x: *e2e failed* on `main` (`schedule`) — <https://github.com/elastic/synthetics/actions/runs/32009079908/attempts/1|#1299>',
        '',
        '*Passed:* `8.19.19`, `9.4.4`',
        '*Failed:* `9.5.0`',
      ].join('\n')
    );
  });

  it('explains when no version jobs ran', () => {
    assert.equal(
      formatSlackMessage({ passed: [], failed: [], ...runMeta }),
      [
        ':x: *e2e failed* on `main` (`schedule`) — <https://github.com/elastic/synthetics/actions/runs/32009079908/attempts/1|#1299>',
        '',
        'No version jobs ran.',
      ].join('\n')
    );
  });
});

#!/usr/bin/env node

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

// Fails if a newer SNAPSHOT has appeared upstream (https://artifacts-api.elastic.co)
// that isn't yet in __tests__/e2e/versions, so the e2e stack-version matrix
// doesn't silently fall behind. Two checks:
//   1. A brand-new dev branch cut (e.g. 9.6.0-SNAPSHOT -> 9.7.0-SNAPSHOT).
//   2. A newer patch snapshot on a branch we already track (e.g. we track
//      8.19.20-SNAPSHOT but upstream has moved on to 8.19.21-SNAPSHOT).

/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_API = 'https://artifacts-api.elastic.co/v1/versions';
const VERSIONS_FILE = path.join(__dirname, '..', 'versions');
const SNAPSHOT_RE = /^(\d+)\.(\d+)\.(\d+)-SNAPSHOT$/;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 10000 }, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`${url} responded with ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error(`Timed out fetching ${url}`));
      });
  });
}

function toTuple(version) {
  const match = version.match(SNAPSHOT_RE);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function branchKey(tuple) {
  return `${tuple[0]}.${tuple[1]}`;
}

function compareTuples(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// Latest upstream snapshot per major.minor branch.
function latestSnapshotsByBranch(versions) {
  const byBranch = new Map();
  for (const version of versions) {
    if (!SNAPSHOT_RE.test(version)) continue;
    const tuple = toTuple(version);
    const key = branchKey(tuple);
    const current = byBranch.get(key);
    if (!current || compareTuples(tuple, current.tuple) > 0) {
      byBranch.set(key, { version, tuple });
    }
  }
  return byBranch;
}

(async () => {
  const { versions } = await fetchJSON(ARTIFACTS_API);
  const upstreamByBranch = latestSnapshotsByBranch(versions);

  if (upstreamByBranch.size === 0) {
    console.error(
      `Could not find any -SNAPSHOT version in the ${ARTIFACTS_API} response`
    );
    process.exit(1);
  }

  const tracked = fs
    .readFileSync(VERSIONS_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const missing = new Map(); // version -> reason

  // 1. Brand-new dev branch: the single highest snapshot across all branches.
  const globalLatest = [...upstreamByBranch.values()].reduce(
    (latest, current) =>
      !latest || compareTuples(current.tuple, latest.tuple) > 0
        ? current
        : latest
  );
  if (!tracked.includes(globalLatest.version)) {
    missing.set(globalLatest.version, 'new dev branch');
  }

  // 2. Existing branch moved on: for every branch we track via a -SNAPSHOT
  // entry, upstream's latest patch snapshot in that same branch must be tracked.
  const trackedBranches = new Set(
    tracked.filter(v => SNAPSHOT_RE.test(v)).map(v => branchKey(toTuple(v)))
  );
  for (const key of trackedBranches) {
    const upstream = upstreamByBranch.get(key);
    if (upstream && !tracked.includes(upstream.version)) {
      missing.set(upstream.version, `branch ${key} moved on`);
    }
  }

  if (missing.size > 0) {
    const details = [...missing.entries()]
      .map(([version, reason]) => `  - ${version} (${reason})`)
      .join('\n');
    console.error(
      `\nUpstream has snapshot(s) not covered in __tests__/e2e/versions:\n\n${details}\n\n` +
        `Add them to that file (and drop any snapshot they supersede) so the e2e suite keeps ` +
        `testing against the current stack development branches.\n`
    );
    process.exit(1);
  }

  console.log(
    'OK: all tracked snapshot branches in __tests__/e2e/versions are up to date'
  );
})().catch(err => {
  console.error('Failed to check for new stack snapshots:', err);
  process.exit(1);
});

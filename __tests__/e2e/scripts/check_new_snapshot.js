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

// Fails if a newer SNAPSHOT has appeared upstream that isn't yet in
// __tests__/e2e/versions, so the e2e stack-version matrix doesn't silently
// fall behind. Uses the per-branch snapshot manifests at
// storage.googleapis.com/artifacts-api/snapshots/<branch>.json (e.g.
// 8.19.json, 9.4.json, main.json) -- these are more complete than the
// aggregate artifacts-api.elastic.co/v1/versions list, which doesn't even
// include older still-maintained branches like 7.17.
//
// Two checks:
//   1. A brand-new dev branch cut (e.g. 9.6.0-SNAPSHOT -> 9.7.0-SNAPSHOT),
//      detected via the "main" branch manifest.
//   2. A newer patch snapshot on a branch we already track (e.g. we track
//      8.19.20-SNAPSHOT but upstream has moved on to 8.19.21-SNAPSHOT).

/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SNAPSHOTS_BASE = 'https://storage.googleapis.com/artifacts-api/snapshots';
const MAIN_BRANCH = 'main';
const VERSIONS_FILE = path.join(__dirname, '..', 'versions');
const SNAPSHOT_RE = /^(\d+)\.(\d+)\.\d+-SNAPSHOT$/;

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

async function currentSnapshotForBranch(branch) {
  const { version } = await fetchJSON(`${SNAPSHOTS_BASE}/${branch}.json`);
  return version;
}

function branchOf(version) {
  const match = version.match(SNAPSHOT_RE);
  return match ? `${match[1]}.${match[2]}` : null;
}

(async () => {
  const tracked = fs
    .readFileSync(VERSIONS_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const trackedBranches = new Set(
    tracked.map(branchOf).filter(branch => branch !== null)
  );

  const missing = new Map(); // version -> reason

  // 1. Brand-new dev branch cut, e.g. main moves from 9.6.0-SNAPSHOT to 9.7.0-SNAPSHOT.
  const mainVersion = await currentSnapshotForBranch(MAIN_BRANCH);
  if (!tracked.includes(mainVersion)) {
    missing.set(mainVersion, 'main branch moved on');
  }

  // 2. Existing branch moved on: for every branch we track via a -SNAPSHOT
  // entry, upstream's current snapshot for that branch must be tracked.
  await Promise.all(
    [...trackedBranches].map(async branch => {
      const version = await currentSnapshotForBranch(branch);
      if (!tracked.includes(version)) {
        missing.set(version, `branch ${branch} moved on`);
      }
    })
  );

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

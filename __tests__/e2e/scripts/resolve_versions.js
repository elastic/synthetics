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

// Resolves the e2e stack-version matrix at run time instead of maintaining a
// hand-curated list. __tests__/e2e/branches names the branches we care about
// (e.g. "main", "8.19", "9.4", "9.5"); for each one this prints the latest GA
// release (skipped for "main", which has none) and the current dev snapshot,
// sourced live from artifacts-api. There's nothing to go stale here -- the
// matrix always reflects upstream's current state.

/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SNAPSHOTS_BASE = 'https://storage.googleapis.com/artifacts-api/snapshots';
const VERSIONS_API = 'https://artifacts-api.elastic.co/v1/versions';
const BRANCHES_FILE = path.join(__dirname, '..', 'branches');
const MAIN_BRANCH = 'main';

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

function latestGAForBranch(branch, allVersions) {
  const patchRe = new RegExp(`^${branch.replace('.', '\\.')}\\.(\\d+)$`);
  let latest = null;
  let latestPatch = -1;
  for (const version of allVersions) {
    const match = version.match(patchRe);
    if (match && Number(match[1]) > latestPatch) {
      latest = version;
      latestPatch = Number(match[1]);
    }
  }
  return latest;
}

async function resolveBranch(branch, allVersions) {
  const { version: snapshot } = await fetchJSON(
    `${SNAPSHOTS_BASE}/${branch}.json`
  );
  const resolved = [snapshot];
  if (branch !== MAIN_BRANCH) {
    const ga = latestGAForBranch(branch, allVersions);
    if (ga) resolved.push(ga);
  }
  return resolved;
}

(async () => {
  const branches = fs
    .readFileSync(BRANCHES_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const { versions: allVersions } = await fetchJSON(VERSIONS_API);

  const resolved = await Promise.all(
    branches.map(branch => resolveBranch(branch, allVersions))
  );
  const versions = resolved.flat();

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(versions));
  } else {
    process.stdout.write(versions.join('\n') + '\n');
  }
})().catch(err => {
  console.error('Failed to resolve stack versions:', err);
  process.exit(1);
});

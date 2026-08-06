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
//
// artifacts-api can lag the next patch snapshot after a release. To cover that
// window, non-main branches also derive the next patch from Elasticsearch's
// latest completed GitHub release and include it once every image used by the
// E2E stack has been published.
//
// A branch line may also name a fixed floor version, e.g. "8.19 8.19.19":
// a permanently pinned known-good release, included in every run regardless
// of what's currently live. This keeps at least one leg passing as a canary
// that the test harness itself works, even if every current GA/snapshot for
// that branch is broken upstream.

/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SNAPSHOTS_BASE = 'https://storage.googleapis.com/artifacts-api/snapshots';
const VERSIONS_API = 'https://artifacts-api.elastic.co/v1/versions';
const ELASTICSEARCH_RELEASES_API =
  'https://api.github.com/repos/elastic/elasticsearch/releases?per_page=100';
const DOCKER_REGISTRY = 'https://docker.elastic.co';
const ES_REPO = 'elasticsearch/elasticsearch';
const STACK_IMAGE_REPOS = [
  ES_REPO,
  'kibana/kibana',
  'elastic-agent/elastic-agent-complete',
];
const MANIFEST_ACCEPT = 'application/vnd.docker.distribution.manifest.v2+json';
const BRANCHES_FILE = path.join(__dirname, '..', 'branches');
const MAIN_BRANCH = 'main';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          timeout: 10000,
          headers: { 'User-Agent': 'synthetics-e2e-version-resolver' },
        },
        res => {
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
        }
      )
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error(`Timed out fetching ${url}`));
      });
  });
}

function requestHead(url, headers) {
  return new Promise((resolve, reject) => {
    https
      .request(url, { method: 'HEAD', headers, timeout: 10000 }, res => {
        res.resume();
        resolve(res);
      })
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error(`Timed out fetching ${url}`));
      })
      .end();
  });
}

// The artifacts-api version list includes versions whose Docker images
// haven't published yet (release automation registers the version before
// every artifact type finishes building) -- confirmed the hard way, when a
// "latest GA" pick 404'd on every image in the stack. Check the registry
// itself instead of trusting that list.
async function dockerImageExists(repository, tag) {
  const manifestUrl = `${DOCKER_REGISTRY}/v2/${repository}/manifests/${tag}`;
  const challenge = await requestHead(manifestUrl, { Accept: MANIFEST_ACCEPT });
  if (challenge.statusCode === 200) return true;
  const authHeader = challenge.headers['www-authenticate'];
  const realm = authHeader && authHeader.match(/realm="([^"]+)"/);
  const service = authHeader && authHeader.match(/service="([^"]+)"/);
  if (!realm || !service) return false;

  const tokenUrl = `${realm[1]}?service=${encodeURIComponent(
    service[1]
  )}&scope=repository:${repository}:pull`;
  const { token } = await fetchJSON(tokenUrl);
  if (!token) return false;

  const verified = await requestHead(manifestUrl, {
    Accept: MANIFEST_ACCEPT,
    Authorization: `Bearer ${token}`,
  });
  return verified.statusCode === 200;
}

async function stackImagesExist(tag) {
  const availability = await Promise.all(
    STACK_IMAGE_REPOS.map(repository => dockerImageExists(repository, tag))
  );
  return availability.every(Boolean);
}

async function latestGAForBranch(branch, allVersions) {
  const patchRe = new RegExp(`^${branch.replace('.', '\\.')}\\.(\\d+)$`);
  const candidates = allVersions
    .filter(version => patchRe.test(version))
    .sort((a, b) => Number(b.match(patchRe)[1]) - Number(a.match(patchRe)[1]));

  for (const candidate of candidates) {
    if (await dockerImageExists(ES_REPO, candidate)) return candidate;
  }
  return null;
}

async function nextSnapshotForBranch(branch, releases) {
  const patchRe = new RegExp(`^v${branch.replace('.', '\\.')}\\.(\\d+)$`);
  const latestPatch = releases
    .filter(release => !release.draft && !release.prerelease)
    .map(release => release.tag_name.match(patchRe))
    .filter(Boolean)
    .map(match => Number(match[1]))
    .sort((a, b) => b - a)[0];

  return latestPatch === undefined
    ? null
    : `${branch}.${latestPatch + 1}-SNAPSHOT`;
}

function snapshotHasReleasedVersion(snapshot, releases) {
  const tagName = `v${snapshot.replace(/-SNAPSHOT$/, '')}`;
  return releases.some(
    release =>
      release.tag_name === tagName && !release.draft && !release.prerelease
  );
}

async function resolveBranch(
  { branch, floor },
  allVersions,
  releases,
  {
    fetchJSONFn = fetchJSON,
    latestGAForBranchFn = latestGAForBranch,
    nextSnapshotForBranchFn = nextSnapshotForBranch,
    stackImagesExistFn = stackImagesExist,
  } = {}
) {
  const { version: snapshot } = await fetchJSONFn(
    `${SNAPSHOTS_BASE}/${branch}.json`
  );
  let resolved = [snapshot];
  if (branch !== MAIN_BRANCH) {
    const nextSnapshot = await nextSnapshotForBranchFn(branch, releases);
    if (nextSnapshot && !resolved.includes(nextSnapshot)) {
      if (await stackImagesExistFn(nextSnapshot)) {
        if (snapshotHasReleasedVersion(snapshot, releases)) resolved = [];
        resolved.push(nextSnapshot);
      }
    }

    const ga = await latestGAForBranchFn(branch, allVersions);
    if (ga) resolved.push(ga);
  }
  if (floor && !resolved.includes(floor)) resolved.push(floor);
  return resolved;
}

async function main() {
  const branches = fs
    .readFileSync(BRANCHES_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [branch, floor] = line.split(/\s+/);
      return { branch, floor };
    });

  const [{ versions: allVersions }, releases] = await Promise.all([
    fetchJSON(VERSIONS_API),
    fetchJSON(ELASTICSEARCH_RELEASES_API),
  ]);

  const resolved = await Promise.all(
    branches.map(entry => resolveBranch(entry, allVersions, releases))
  );
  const versions = resolved.flat();

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(versions));
  } else {
    process.stdout.write(versions.join('\n') + '\n');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to resolve stack versions:', err);
    process.exit(1);
  });
}

module.exports = { nextSnapshotForBranch, resolveBranch };

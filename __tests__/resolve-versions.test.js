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

const {
  nextSnapshotForBranch,
  resolveBranch,
} = require('./e2e/scripts/resolve_versions');

describe('E2E version resolver', () => {
  it('derives the next patch snapshot from the latest completed release', async () => {
    await expect(
      nextSnapshotForBranch('9.5', [
        { tag_name: 'v9.5.0', draft: false, prerelease: false },
        { tag_name: 'v9.5.1', draft: false, prerelease: false },
        { tag_name: 'v9.5.2-rc1', draft: false, prerelease: true },
        { tag_name: 'v9.6.0', draft: false, prerelease: false },
      ])
    ).resolves.toBe('9.5.2-SNAPSHOT');
  });

  it('replaces a released snapshot with an inferred snapshot when every image is available', async () => {
    const stackImagesExistFn = jest.fn().mockResolvedValue(true);

    await expect(
      resolveBranch(
        { branch: '9.5' },
        [],
        [{ tag_name: 'v9.5.0', draft: false, prerelease: false }],
        {
          fetchJSONFn: jest
            .fn()
            .mockResolvedValue({ version: '9.5.0-SNAPSHOT' }),
          latestGAForBranchFn: jest.fn().mockResolvedValue('9.5.0'),
          stackImagesExistFn,
        }
      )
    ).resolves.toEqual(['9.5.1-SNAPSHOT', '9.5.0']);
    expect(stackImagesExistFn).toHaveBeenCalledWith('9.5.1-SNAPSHOT');
  });

  it('omits an inferred snapshot when an image is not published', async () => {
    await expect(
      resolveBranch(
        { branch: '9.5' },
        [],
        [{ tag_name: 'v9.5.0', draft: false, prerelease: false }],
        {
          fetchJSONFn: jest
            .fn()
            .mockResolvedValue({ version: '9.5.0-SNAPSHOT' }),
          latestGAForBranchFn: jest.fn().mockResolvedValue('9.5.0'),
          stackImagesExistFn: jest.fn().mockResolvedValue(false),
        }
      )
    ).resolves.toEqual(['9.5.0-SNAPSHOT', '9.5.0']);
  });
});

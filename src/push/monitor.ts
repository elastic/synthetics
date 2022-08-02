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

import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { Bundler } from './bundler';
import { sendRequest } from './request';
import { removeTrailingSlash, SYNTHETICS_PATH } from '../helpers';
import { LocationsMap } from '../locations/public-locations';
import { Monitor, MonitorConfig } from '../dsl/monitor';
import { PushOptions } from '../common_types';

export type MonitorSchema = Omit<MonitorConfig, 'locations'> & {
  content: string;
  locations: string[];
  filter: Monitor['filter'];
};

type APISchema = {
  project: string;
  keep_stale: boolean;
  monitors: MonitorSchema[];
};

function translateLocation(locations?: MonitorConfig['locations']) {
  if (!locations) return [];
  return locations.map(loc => LocationsMap[loc]).filter(Boolean);
}

export async function buildMonitorSchema(monitors: Monitor[]) {
  /**
   * Set up the bundle artifacts path which can be used to
   * create the bundles required for uploading journeys
   */
  const bundlePath = join(SYNTHETICS_PATH, 'bundles');
  await mkdir(bundlePath, { recursive: true });
  const bundler = new Bundler();
  const schemas: MonitorSchema[] = [];

  for (const monitor of monitors) {
    const { source, config, filter } = monitor;
    const outPath = join(bundlePath, config.name + '.zip');
    const content = await bundler.build(source.file, outPath);
    schemas.push({
      ...config,
      content,
      locations: translateLocation(config.locations),
      filter: filter,
    });
  }

  await rm(bundlePath, { recursive: true });
  return schemas;
}

export async function createMonitors(
  monitors: MonitorSchema[],
  options: PushOptions
) {
  const schema: APISchema = {
    project: options.project,
    keep_stale: false,
    monitors,
  };

  return await sendRequest({
    url:
      removeTrailingSlash(options.url) +
      `/s/${options.space}/api/synthetics/service/project/monitors`,
    method: 'PUT',
    auth: options.auth,
    body: JSON.stringify(schema),
  });
}

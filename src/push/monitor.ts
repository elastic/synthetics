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

import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { LineCounter, parseDocument, YAMLSeq, YAMLMap } from 'yaml';
import { bold, red } from 'kleur/colors';
import { Bundler } from './bundler';
import { sendRequest } from './request';
import {
  removeTrailingSlash,
  SYNTHETICS_PATH,
  totalist,
  indent,
} from '../helpers';
import { LocationsMap } from '../locations/public-locations';
import { Monitor, MonitorConfig } from '../dsl/monitor';
import { PushOptions } from '../common_types';

export type MonitorSchema = Omit<MonitorConfig, 'locations'> & {
  locations: string[];
  content?: string;
  filter?: Monitor['filter'];
};

export type APISchema = {
  project: string;
  keep_stale: boolean;
  monitors: MonitorSchema[];
};

function translateLocation(locations?: MonitorConfig['locations']) {
  if (!locations) return [];
  return locations.map(loc => LocationsMap[loc] || loc).filter(Boolean);
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
    const { source, config, filter, type } = monitor;
    const schema = {
      ...config,
      locations: translateLocation(config.locations),
    };
    if (type === 'browser') {
      const outPath = join(bundlePath, config.name + '.zip');
      const content = await bundler.build(source.file, outPath);
      Object.assign(schema, { content, filter });
    }
    schemas.push(schema);
  }

  await rm(bundlePath, { recursive: true });
  return schemas;
}

export async function createLightweightMonitors(
  workDir: string,
  options: PushOptions
) {
  const lwFiles = new Set<string>();
  await totalist(workDir, (rel, abs) => {
    if (/.(yml|yaml)$/.test(rel)) {
      lwFiles.add(abs);
    }
  });

  const monitors: Monitor[] = [];
  for (const file of lwFiles.values()) {
    const content = await readFile(file, 'utf-8');
    const lineCounter = new LineCounter();
    const parsedDoc = parseDocument(content, {
      lineCounter,
      keepSourceTokens: true,
    });
    // Skip other yml files that are not relevant
    const monitorSeq = parsedDoc.get('heartbeat.monitors') as YAMLSeq<YAMLMap>;
    if (!monitorSeq) {
      continue;
    }

    for (const monNode of monitorSeq.items) {
      // Skip browser monitors and disabled monitors from pushing
      if (
        monNode.get('type') === 'browser' ||
        monNode.get('enabled') === false
      ) {
        continue;
      }
      const config = monNode.toJSON();
      const { line, col } = lineCounter.linePos(monNode.srcToken.offset);
      try {
        const mon = buildMonitorFromYaml(config, options);
        mon.setSource({ file, line, column: col });
        monitors.push(mon);
      } catch (e) {
        let outer = bold(`Aborted: ${e}\n`);
        outer += indent(
          `* ${config.id || config.name} - ${file}:${line}:${col}\n`
        );
        throw red(outer);
      }
    }
  }
  return monitors;
}

const REQUIRED_MONITOR_FIELDS = ['id', 'name'];
export function buildMonitorFromYaml(
  config: MonitorConfig,
  options: PushOptions
) {
  // Validate required fields
  for (const field of REQUIRED_MONITOR_FIELDS) {
    if (!config[field]) {
      throw `Monitor ${field} is required`;
    }
  }
  const schedule = parseSchedule(String(config.schedule));
  const privateLocations =
    config['private_locations'] || options.privateLocations;
  delete config['private_locations'];

  return new Monitor({
    locations: options.locations,
    ...config,
    privateLocations,
    schedule: schedule || options.schedule,
  });
}

export function parseSchedule(schedule: string) {
  const EVERY_SYNTAX = '@every';
  if (!(schedule + '').startsWith(EVERY_SYNTAX)) {
    throw `Monitor schedule format(${schedule}) not supported: use '@every' syntax instead`;
  }

  const duration = schedule.substring(EVERY_SYNTAX.length + 1);
  // split between non-digit (\D) and a digit (\d)
  const durations = duration.split(/(?<=\D)(?=\d)/g);
  let minutes = 0;
  for (const dur of durations) {
    // split between a digit and non-digit
    const [value, format] = dur.split(/(?<=\d)(?=\D)/g);
    // Calculate
    if (format === 's') {
      minutes++;
    } else if (format === 'm') {
      minutes += Number(value);
    } else if (format === 'h') {
      minutes += Number(value) * 60;
    }
  }
  return minutes;
}

export async function createMonitors(
  monitors: MonitorSchema[],
  options: PushOptions,
  keepStale: boolean
) {
  const schema: APISchema = {
    project: options.id,
    keep_stale: keepStale,
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

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
import { extname, join } from 'path';
import { LineCounter, parseDocument, YAMLSeq, YAMLMap } from 'yaml';
import { bold, red } from 'kleur/colors';
import { Bundler } from './bundler';
import { SYNTHETICS_PATH, totalist, indent, warn, isMatch } from '../helpers';
import { LocationsMap } from '../locations/public-locations';
import { ALLOWED_SCHEDULES, Monitor, MonitorConfig } from '../dsl/monitor';
import { PushOptions } from '../common_types';
import { isParamOptionSupported } from './utils';

// Allowed extensions for lightweight monitor files
const ALLOWED_LW_EXTENSIONS = ['.yml', '.yaml'];

export type MonitorSchema = Omit<MonitorConfig, 'locations'> & {
  locations: string[];
  content?: string;
  filter?: Monitor['filter'];
  hash?: string;
};

// Abbreviated monitor info, as often returned by the API,
// just the journey ID and hash
export type MonitorHashID = {
  journey_id?: string;
  hash?: string;
};

function translateLocation(locations?: MonitorConfig['locations']) {
  if (!locations) return [];
  return locations.map(loc => LocationsMap[loc] || loc).filter(Boolean);
}

class RemoteDiffResult {
  // The set of monitor IDs that have been added
  newIDs = new Set<string>();
  // Monitor IDs that are different locally than remotely
  changedIDs = new Set<string>();
  // Monitor IDs that are no longer present locally
  removedIDs = new Set<string>();
  // Monitor IDs that are identical on the remote server
  unchangedIDs = new Set<string>();
}

export function diffMonitors(
  local: MonitorHashID[],
  remote: MonitorHashID[]
): RemoteDiffResult {
  const result = new RemoteDiffResult();
  const localMonitorsIDToHash = new Map<string, string>();
  for (const hashID of local) {
    localMonitorsIDToHash.set(hashID.journey_id, hashID.hash);
  }
  const remoteMonitorsIDToHash = new Map<string, string>();
  for (const hashID of remote) {
    remoteMonitorsIDToHash.set(hashID.journey_id, hashID.hash);
  }

  // Compare local to remote
  for (const [localID, localHash] of localMonitorsIDToHash) {
    // Hash is reset to '' when a monitor is edited on the UI
    if (!remoteMonitorsIDToHash.has(localID)) {
      result.newIDs.add(localID);
    } else {
      const remoteHash = remoteMonitorsIDToHash.get(localID);
      if (remoteHash != localHash) {
        result.changedIDs.add(localID);
      } else if (remoteHash === localHash) {
        result.unchangedIDs.add(localID);
      }
    }
    // We no longer need to process this ID, removing it here
    // reduces the numbers considered in the next phase
    remoteMonitorsIDToHash.delete(localID);
  }

  for (const [id] of remoteMonitorsIDToHash) {
    result.removedIDs.add(id);
  }
  return result;
}

export function getLocalMonitors(monitors: Monitor[]) {
  const data: MonitorHashID[] = [];
  for (const monitor of monitors) {
    data.push({
      journey_id: monitor.config.id,
      hash: monitor.hash(),
    });
  }
  return data;
}

export async function buildMonitorSchema(monitors: Monitor[], isV2: boolean) {
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
    const schema: MonitorSchema = {
      ...config,
      locations: translateLocation(config.locations),
    };
    if (isV2) {
      schema.hash = monitor.hash();
    }
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
  // Filter monitor files based on the provided pattern
  const pattern = options.pattern
    ? new RegExp(options.pattern, 'i')
    : /.(yml|yaml)$/;
  const ignore = /(node_modules|.github)/;
  await totalist(workDir, (rel, abs) => {
    if (
      !ignore.test(rel) &&
      pattern.test(rel) &&
      ALLOWED_LW_EXTENSIONS.includes(extname(abs))
    ) {
      lwFiles.add(abs);
    }
  });

  let warnOnce = false;
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
    // Warn users about schedule that are less than 60 seconds
    if (!warnOnce) {
      warn(
        'Lightweight monitor schedules will be adjusted to their nearest frequency supported by our synthetics infrastructure.'
      );
      warnOnce = true;
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
      // Filter based on matched tags and name
      if (!isMatch(config.tags, config.name, options.tags, options.match)) {
        continue;
      }
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
  const schedule = config.schedule && parseSchedule(String(config.schedule));
  const privateLocations =
    config['private_locations'] || options.privateLocations;
  delete config['private_locations'];

  const alertConfig = parseAlertConfig(config);
  const mon = new Monitor({
    locations: options.locations,
    ...config,
    privateLocations,
    schedule: schedule || options.schedule,
    alert: alertConfig,
  });

  /**
   * Params support is only available for lighweight monitors
   * post 8.7.2 stack
   */
  if (isParamOptionSupported(options.kibanaVersion)) {
    mon.config.params = options.params;
  }
  return mon;
}

export const parseAlertConfig = (config: MonitorConfig) => {
  if (config['alert.status.enabled'] !== undefined) {
    const value = config['alert.status.enabled'];
    delete config['alert.status.enabled'];
    return {
      status: {
        enabled: value,
      },
    };
  }
  return config.alert;
};

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
    // Calculate based on the duration symbol
    const scheduleValue = parseInt(value, 10);
    switch (format) {
      case 's':
        minutes += Math.round(scheduleValue / 60);
        break;
      case 'm':
        minutes += scheduleValue;
        break;
      case 'h':
        minutes += scheduleValue * 60;
        break;
      case 'd':
        minutes += scheduleValue * 24 * 60;
        break;
    }
  }
  return nearestSchedule(minutes);
}

// Find the nearest schedule that is supported by the platform
// from the parsed schedule value
function nearestSchedule(minutes) {
  let nearest: typeof ALLOWED_SCHEDULES[number] = ALLOWED_SCHEDULES[0];
  let prev = Math.abs(nearest - minutes);
  for (let i = 1; i < ALLOWED_SCHEDULES.length; i++) {
    const curr = Math.abs(ALLOWED_SCHEDULES[i] - minutes);
    if (curr <= prev) {
      nearest = ALLOWED_SCHEDULES[i];
      prev = curr;
    }
  }
  return nearest;
}

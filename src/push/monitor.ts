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
import { LineCounter, parseDocument, Document, YAMLSeq, YAMLMap } from 'yaml';
import { bold, red } from 'kleur/colors';
import { Bundler } from './bundler';
import NodeBuffer from 'node:buffer';
import { SYNTHETICS_PATH, totalist, indent, warn } from '../helpers';
import { LocationsMap } from '../locations/public-locations';
import {
  AlertConfig,
  ALLOWED_SCHEDULES,
  Monitor,
  MonitorConfig,
} from '../dsl/monitor';
import { PushOptions } from '../common_types';
import { isParamOptionSupported, normalizeMonitorName } from './utils';

// Allowed extensions for lightweight monitor files
const ALLOWED_LW_EXTENSIONS = ['.yml', '.yaml'];
// 1500kB Max Gzipped limit for bundled monitor code to be pushed as Kibana project monitors.
const SIZE_LIMIT_KB = 1500;

export type MonitorSchema = Omit<MonitorConfig, 'locations'> & {
  locations: string[];
  content?: string;
  filter?: Monitor['filter'];
  hash?: string;
  size?: number;
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

export function getLocalMonitors(schemas: MonitorSchema[]) {
  const data: MonitorHashID[] = [];
  for (const schema of schemas) {
    data.push({
      journey_id: schema.id,
      hash: schema.hash,
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
  const sizes: Map<string, number> = new Map();

  for (const monitor of monitors) {
    const { source, config, filter, type } = monitor;
    const schema: MonitorSchema = {
      ...config,
      locations: translateLocation(config.locations),
    };

    if (type === 'browser') {
      const outPath = join(
        bundlePath,
        normalizeMonitorName(config.name) + '.zip'
      );
      const content = await bundler.build(source.file, outPath);
      monitor.setContent(content);
      Object.assign(schema, { content, filter });
    }
    const size = monitor.size();
    const sizeKB = Math.round(size / 1000);
    if (sizeKB > SIZE_LIMIT_KB) {
      let outer = bold(
        `Aborted: Bundled code ${sizeKB}kB exceeds the recommended ${SIZE_LIMIT_KB}kB limit. Please check the dependencies imported.\n`
      );
      const inner = `* ${config.id} - ${source.file}:${source.line}:${source.column}\n`;
      outer += indent(inner);
      throw red(outer);
    }
    sizes.set(config.id, size);
    /**
     * Generate hash only after the bundled content is created
     * to capture code changes in imported files
     */
    if (isV2) {
      schema.hash = monitor.hash();
    }
    schemas.push(schema);
  }

  await rm(bundlePath, { recursive: true });
  return { schemas, sizes };
}

export async function createLightweightMonitors(
  workDir: string,
  options: PushOptions
) {
  const lwFiles = new Set<string>();
  // Filter monitor files based on the provided pattern
  const pattern = options.grepOpts?.pattern
    ? new RegExp(options.grepOpts?.pattern, 'i')
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
    // First check encoding and warn if any files are not the correct encoding.
    const bufferContent = await readFile(file);
    const isUtf8 = NodeBuffer.isUtf8(bufferContent);
    if (!isUtf8) {
      warn(`${file} is not UTF-8 encoded. Monitors might be skipped.`);
    }
    const content = bufferContent.toString('utf-8');
    const lineCounter = new LineCounter();
    const parsedDoc = parseDocument(content, {
      lineCounter,
      merge: true,
      keepSourceTokens: true,
    }) as Document.Parsed;
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

    // Store the offsets of each monitor in the sequence to construct the source
    // location later for capturing the error
    const offsets = [];
    for (const monNode of monitorSeq.items) {
      offsets.push(monNode.srcToken.offset);
    }

    const mergedConfig = parsedDoc.toJS()[
      'heartbeat.monitors'
    ] as Array<MonitorConfig>;
    for (let i = 0; i < mergedConfig.length; i++) {
      const monitor = mergedConfig[i];
      // Skip browser monitors from the YML files
      if (monitor['type'] === 'browser') {
        warn(`Browser monitors from ${file} are skipped.`);
        continue;
      }
      const { line, col } = lineCounter.linePos(offsets[i]);
      try {
        /**
         * Build the monitor object from the yaml config along with global configuration
         * and perform the match based on the provided filters
         */
        const mon = buildMonitorFromYaml(monitor, options);
        if (!mon.isMatch(options.grepOpts?.match, options.grepOpts?.tags)) {
          continue;
        }
        mon.setSource({ file, line, column: col });
        monitors.push(mon);
      } catch (e) {
        let outer = bold(`Aborted: ${e}\n`);
        outer += indent(
          `* ${monitor.id || monitor.name} - ${file}:${line}:${col}\n`
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
    config['private_locations'] ||
    config.privateLocations ||
    options.privateLocations;
  const retestOnFailure =
    config['retest_on_failure'] ?? options.retestOnFailure;
  const alertConfig = parseAlertConfig(config, options.alert);

  const mon = new Monitor({
    enabled: config.enabled ?? options.enabled,
    locations: options.locations,
    tags: options.tags,
    fields: parseFields(config, options.fields),
    ...normalizeConfig(config),
    retestOnFailure,
    privateLocations,
    schedule:
      (schedule as typeof ALLOWED_SCHEDULES[number]) || options.schedule,
    alert: alertConfig,
  });

  /**
   * Params support is only available for lightweight monitors
   * post 8.7.2 stack
   */
  if (isParamOptionSupported(options.kibanaVersion)) {
    mon.config.params = options.params;
  }
  return mon;
}

// Deletes unnecessary fields from the lightweight monitor config
//  that is not supported by the Kibana API
function normalizeConfig(config: MonitorConfig) {
  delete config['private_locations'];
  delete config['retest_on_failure'];
  return config;
}

export const parseAlertConfig = (
  config: MonitorConfig,
  gConfig?: AlertConfig
) => {
  // If the user has provided a global alert config, merge it with the monitor alert config
  const status = getAlertKeyValue('status', config, gConfig);
  const tls = getAlertKeyValue('tls', config, gConfig);
  const result = {};
  if (status) {
    result['status'] = status;
  }
  if (tls) {
    result['tls'] = tls;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export const parseFields = (
  config: MonitorConfig,
  gFields?: Record<string, string>
) => {
  // get all keys starting with `label.`
  const keys = Object.keys(config).filter(key => key.startsWith('fields.'));
  const fields = {};
  for (const key of keys) {
    fields[key.replace('fields.', '')] = config[key];
    delete config[key];
  }
  if (gFields) {
    for (const key of Object.keys(gFields)) {
      fields[key] = gFields[key];
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
};

export function getAlertKeyValue(
  key: 'status' | 'tls',
  config: MonitorConfig,
  alertConfig?: AlertConfig
): { enabled: boolean } {
  const value = config.alert;
  if (value?.[key]?.enabled !== undefined) {
    return {
      enabled: value[key].enabled,
    };
  }

  if (value?.[`${key}.enabled`] !== undefined) {
    const val = value?.[`${key}.enabled`];
    delete value?.[`${key}.enabled`];
    if (Object.keys(value).length === 0) {
      delete config.alert;
    }
    return {
      enabled: val,
    };
  }
  const rootKey = `alert.${key}.enabled`;
  if (config[rootKey] !== undefined) {
    const enabled = config[rootKey];
    delete config[rootKey];
    return {
      enabled,
    };
  }

  return alertConfig?.[key];
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
  let seconds = 0;
  for (const dur of durations) {
    // split between a digit and non-digit
    const [value, format] = dur.split(/(?<=\d)(?=\D)/g);
    // Calculate based on the duration symbol
    const scheduleValue = parseInt(value, 10);
    switch (format) {
      case 's':
        if (scheduleValue < 60) {
          seconds += scheduleValue;
        } else {
          minutes += Math.round(scheduleValue / 60);
        }
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
  return nearestSchedule(minutes, seconds);
}

// Find the nearest schedule that is supported by the platform
// from the parsed schedule value
function nearestSchedule(minutes: number, seconds: number) {
  if (seconds > 0 && minutes === 0) {
    // we allow only 10 and 30 seconds, return the nearest one
    return seconds < 20 ? '10s' : '30s';
  }
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

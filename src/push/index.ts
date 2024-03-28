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
import { readFile, writeFile } from 'fs/promises';
import { prompt } from 'enquirer';
import { bold, grey } from 'kleur/colors';
import {
  getLocalMonitors,
  buildMonitorSchema,
  diffMonitors as diffMonitorHashIDs,
  MonitorSchema,
} from './monitor';
import { ALLOWED_SCHEDULES, Monitor } from '../dsl/monitor';
import {
  progress,
  liveProgress,
  write,
  error,
  warn,
  indent,
  done,
  getMonitorManagementURL,
  THROTTLING_WARNING_MSG,
} from '../helpers';
import type { PushOptions, ProjectSettings } from '../common_types';
import { findSyntheticsConfig, readConfig } from '../config';
import {
  bulkDeleteMonitors,
  bulkGetMonitors,
  bulkPutMonitors,
  createMonitorsLegacy,
  CHUNK_SIZE,
} from './kibana_api';
import {
  getChunks,
  isBulkAPISupported,
  isLightweightMonitorSupported,
  logDiff,
} from './utils';

export async function push(monitors: Monitor[], options: PushOptions) {
  const duplicates = trackDuplicates(monitors);
  if (duplicates.size > 0) {
    throw error(formatDuplicateError(duplicates));
  }
  progress(
    `Pushing monitors for '${options.id}' project in kibana '${options.space}' space`
  );

  /**
   * Legacy API for kibana which does not support bulk operations
   */
  if (!isBulkAPISupported(options.kibanaVersion)) {
    return await pushLegacy(monitors, options);
  }

  const { monitors: remote } = await bulkGetMonitors(options);

  progress(`bundling ${monitors.length} monitors`);
  const schemas = await buildMonitorSchema(monitors, true);
  const local = getLocalMonitors(schemas);

  const { newIDs, changedIDs, removedIDs, unchangedIDs } = diffMonitorHashIDs(
    local,
    remote
  );
  logDiff(newIDs, changedIDs, removedIDs, unchangedIDs);

  const updatedMonitors = new Set<string>([...changedIDs, ...newIDs]);
  if (updatedMonitors.size > 0) {
    const chunks = getChunks(schemas, CHUNK_SIZE);
    for (const chunk of chunks) {
      await liveProgress(
        bulkPutMonitors(options, chunk),
        `creating or updating ${chunk.length} monitors`
      );
    }
  }

  if (removedIDs.size > 0) {
    if (updatedMonitors.size === 0 && unchangedIDs.size === 0) {
      await promptConfirmDeleteAll(options);
    }
    const chunks = getChunks(Array.from(removedIDs), CHUNK_SIZE);
    for (const chunk of chunks) {
      await liveProgress(
        bulkDeleteMonitors(options, chunk),
        `deleting ${chunk.length} monitors`
      );
    }
  }

  done(`Pushed: ${grey(getMonitorManagementURL(options.url))}`);
}

async function promptConfirmDeleteAll(options: PushOptions) {
  write('');
  const { deleteAll } = await prompt<{ deleteAll: boolean }>({
    type: 'confirm',
    skip() {
      if (options.yes) {
        this.initial = process.env.TEST_OVERRIDE ?? true;
        return true;
      }
      return false;
    },
    name: 'deleteAll',
    message: `Pushing without any monitors will delete all monitors associated with the project.\n Do you want to continue?`,
    initial: false,
  });
  if (!deleteAll) {
    throw warn('Push command Aborted');
  }
}

function trackDuplicates(monitors: Monitor[]) {
  const monitorMap: Map<string, Monitor> = new Map();
  const duplicates: Set<Monitor> = new Set();
  for (const monitor of monitors) {
    const id = monitor.config.id;
    if (monitorMap.has(id)) {
      duplicates.add(monitorMap.get(id));
      duplicates.add(monitor);
    }
    monitorMap.set(id, monitor);
  }
  return duplicates;
}

export function formatDuplicateError(monitors: Set<Monitor>) {
  let outer = bold(`Aborted: Duplicate monitors found\n`);

  let inner = '';
  for (const monitor of monitors) {
    const { config, source } = monitor;
    inner += `* ${config.id} - ${source.file}:${source.line}:${source.column}\n`;
  }
  outer += indent(inner);
  return outer;
}

const INSTALLATION_HELP = `Run 'npx @elastic/synthetics init' to create project with default settings.`;

export async function loadSettings(configPath, ignoreMissing = false) {
  try {
    const config = await readConfig(
      process.env['NODE_ENV'] || 'development',
      configPath
    );
    // Missing config file, fake throw to capture as missing file
    if (Object.keys(config).length === 0) {
      throw '';
    }
    return config.project || ({} as ProjectSettings);
  } catch (e) {
    if (!ignoreMissing) {
      throw error(`Aborted (missing synthetics config file), Project not set up correctly.

${INSTALLATION_HELP}`);
    }
  }
}

export async function validatePush(
  opts: PushOptions,
  settings: ProjectSettings
) {
  validateSettings(opts);
  await catchIncorrectSettings(settings, opts);
}

export function validateSettings(opts: PushOptions) {
  const INVALID = 'Aborted. Invalid synthetics project settings.';

  let reason = '';
  if (!opts.id) {
    reason = `Set project id via
  - CLI '--id <id>'
  - Config file 'project.id' field`;
  } else if (!opts.locations && !opts.privateLocations) {
    reason = `Set default location for all monitors via
  - CLI '--locations <values...> or --privateLocations <values...>'
  - Config file 'monitors.locations' | 'monitors.privateLocations' field`;
  } else if (!opts.schedule) {
    reason = `Set default schedule in minutes for all monitors via
  - CLI '--schedule <mins>'
  - Config file 'monitors.schedule' field`;
  } else if (opts.schedule && !ALLOWED_SCHEDULES.includes(opts.schedule)) {
    reason = `Set default schedule(${
      opts.schedule
    }) to one of the allowed values - ${ALLOWED_SCHEDULES.join(',')}`;
  }

  if (!reason) return;

  throw error(`${INVALID}

${reason}

${INSTALLATION_HELP}`);
}

async function overrideSettings(
  configPath,
  oldValue: string,
  newValue: string
) {
  const cwd = process.cwd();
  configPath = configPath ?? (await findSyntheticsConfig(cwd, cwd));
  if (!configPath) {
    throw warn(`Unable to find synthetics config file: ${configPath}`);
  }
  const config = await readFile(configPath, 'utf-8');
  const updatedConfig = config.replace(
    `id: '${oldValue}'`,
    `id: '${newValue}'`
  );
  await writeFile(configPath, updatedConfig, 'utf-8');
}

export async function catchIncorrectSettings(
  settings: ProjectSettings,
  options: PushOptions
) {
  let override = !settings.id;
  if (settings.id && settings.id !== options.id) {
    // Add an extra line to make it easier to read the prompt
    write('');
    ({ override } = await prompt<{ override: boolean }>({
      type: 'confirm',
      name: 'override',
      skip() {
        if (options.yes) {
          this.initial = process.env.TEST_OVERRIDE ?? true;
          return true;
        }
        return false;
      },
      message: `Monitors were pushed under the '${settings.id}' project. Are you sure you want to push them under the new '${options.id}' (note that this will duplicate the monitors, the old ones being orphaned)`,
      initial: false,
    }));
    if (!override) {
      throw warn('Push command Aborted');
    }
  }
  if (override) {
    await overrideSettings(options.config, settings.id, options.id);
  }
}

export async function pushLegacy(monitors: Monitor[], options: PushOptions) {
  if (isLightweightMonitorSupported(monitors, options)) {
    throw error(
      `Aborted: Lightweight monitors are not supported in ${options.kibanaVersion}. Please upgrade to 8.5.0 or above.`
    );
  }

  let schemas: MonitorSchema[] = [];
  if (monitors.length > 0) {
    progress(`bundling ${monitors.length} monitors`);
    schemas = await buildMonitorSchema(monitors, false);
    const chunks = getChunks(schemas, 10);
    for (const chunk of chunks) {
      await liveProgress(
        createMonitorsLegacy({ schemas: chunk, keepStale: true, options }),
        `creating or updating ${chunk.length} monitors`
      );
    }
  } else {
    await promptConfirmDeleteAll(options);
  }
  await liveProgress(
    createMonitorsLegacy({ schemas, keepStale: false, options }),
    `deleting all stale monitors`
  );

  done(`Pushed: ${grey(getMonitorManagementURL(options.url))}`);
}

// prints warning if any of the monitors has throttling settings enabled during push
export function warnIfThrottled(monitors: Monitor[]) {
  const throttled = monitors.some(monitor => monitor.config.throttling != null);
  if (throttled) {
    warn(THROTTLING_WARNING_MSG);
  }
}

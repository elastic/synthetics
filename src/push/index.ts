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
  buildLocalMonitors,
  buildMonitorSchema,
  diffMonitors as diffMonitorHashIDs,
} from './monitor';
import { ALLOWED_SCHEDULES, Monitor } from '../dsl/monitor';
import {
  progress,
  write,
  error,
  warn,
  indent,
  liveProgress,
  doneLabel,
} from '../helpers';
import type { PushOptions, ProjectSettings } from '../common_types';
import { findSyntheticsConfig, readConfig } from '../config';
import {
  bulkDeleteMonitors,
  bulkGetMonitors,
  bulkPutMonitors,
} from './kibana_api';
import { logPushProgress } from './utils';

export async function push(monitors: Monitor[], options: PushOptions) {
  progress('Pushing monitors to Kibana for Project: ' + options.id);

  const label = doneLabel(`Pushed: ${grey(options.url)}`);
  console.time(label);

  const duplicates = trackDuplicates(monitors);
  if (duplicates.size > 0) {
    throw error(formatDuplicateError(duplicates));
  }
  const local = buildLocalMonitors(monitors);
  const { monitors: remote } = await bulkGetMonitors(options);

  const { changedIDs, removedIDs, unchangedIDs, newIDs } = diffMonitorHashIDs(
    local,
    remote
  );

  logPushProgress({ unchangedIDs, removedIDs, changedIDs, newIDs });

  const updatedMonitors = new Set<string>([...changedIDs, ...newIDs]);

  if (updatedMonitors.size > 0) {
    const toChange = monitors.filter(m => updatedMonitors.has(m.config.id));
    progress(`bundling ${toChange.length} monitors`);
    const schemas = await buildMonitorSchema(toChange);

    const chunks = getChunks(schemas, 100);

    for (const chunk of chunks) {
      const bulkPutPromise = bulkPutMonitors(options, chunk);
      await liveProgress(bulkPutPromise, `creating ${chunk.length} monitors`);
    }
  }

  if (removedIDs.size > 0) {
    if (updatedMonitors.size === 0 && unchangedIDs.size === 0) {
      await promptConfirmDeleteAll(options);
    }
    await liveProgress(
      bulkDeleteMonitors(options, Array.from(removedIDs)),
      `deleting ${removedIDs.size} monitors`
    );
  }

  console.timeEnd(label);
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

export async function loadSettings() {
  try {
    const config = await readConfig(process.env['NODE_ENV'] || 'development');
    // Missing config file, fake throw to capture as missing file
    if (Object.keys(config).length === 0) {
      throw '';
    }
    return config.project || ({} as ProjectSettings);
  } catch (e) {
    throw error(`Aborted (missing synthetics config file), Project not set up correctly.

${INSTALLATION_HELP}`);
  }
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

async function overrideSettings(oldValue: string, newValue: string) {
  const cwd = process.cwd();
  const configPath = await findSyntheticsConfig(cwd, cwd);
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
    await overrideSettings(settings.id, options.id);
  }
}

const getChunks = (arr: any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

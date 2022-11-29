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
  ok,
  formatAPIError,
  formatFailedMonitors,
  formatNotFoundError,
  formatStaleMonitors,
} from './request';
import { buildMonitorSchema, createMonitors, MonitorSchema } from './monitor';
import { ALLOWED_SCHEDULES, Monitor } from '../dsl/monitor';
import {
  progress,
  apiProgress,
  write,
  error,
  warn,
  indent,
  safeNDJSONParse,
  done,
  getMonitorManagementURL,
} from '../helpers';
import type { PushOptions, ProjectSettings } from '../common_types';
import { findSyntheticsConfig, readConfig } from '../config';

export async function push(monitors: Monitor[], options: PushOptions) {
  let schemas: MonitorSchema[] = [];
  if (monitors.length > 0) {
    const duplicates = trackDuplicates(monitors);
    if (duplicates.size > 0) {
      throw error(formatDuplicateError(duplicates));
    }

    progress(`preparing all monitors`);
    schemas = await buildMonitorSchema(monitors);

    progress(`creating all monitors`);

    const chunks = getArrayChunks(schemas, 10);

    for (const chunk of chunks) {
      await pushMonitors({ schemas: chunk, keepStale: true, options });
    }
  } else {
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
  progress(`deleting all stale monitors`);
  await pushMonitors({ schemas, keepStale: false, options });

  done(`Pushed: ${grey(getMonitorManagementURL(options.url))}`);
}

export async function pushMonitors({
  schemas,
  keepStale,
  options,
}: {
  schemas: MonitorSchema[];
  keepStale: boolean;
  options: PushOptions;
}) {
  const { body, statusCode } = await createMonitors(
    schemas,
    options,
    keepStale
  );
  if (statusCode === 404) {
    throw formatNotFoundError(await body.text());
  }
  if (!ok(statusCode)) {
    const { error, message } = await body.json();
    throw formatAPIError(statusCode, error, message);
  }
  body.setEncoding('utf-8');
  for await (const data of body) {
    // Its kind of hacky for now where Kibana streams the response by
    // writing the data as NDJSON events (data can be interleaved), we
    // distinguish the final data by checking if the event was a progress vs complete event
    const chunks = safeNDJSONParse(data);
    for (const chunk of chunks) {
      if (typeof chunk === 'string') {
        // TODO: add progress back for all states once we get the fix
        // on kibana side
        keepStale && apiProgress(chunk);
        continue;
      }
      const { failedMonitors, failedStaleMonitors } = chunk;
      if (failedMonitors && failedMonitors.length > 0) {
        throw formatFailedMonitors(failedMonitors);
      }
      if (failedStaleMonitors.length > 0) {
        throw formatStaleMonitors(failedStaleMonitors);
      }
    }
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
    throw error(`Aborted (missing synthetics config file), Project not set up corrrectly.

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

function getArrayChunks<T>(arr: T[], chunkSize: number): T[][] {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

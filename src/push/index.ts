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
import { bold, yellow } from 'kleur/colors';
import {
  ok,
  formatAPIError,
  formatFailedMonitors,
  formatNotFoundError,
  formatStaleMonitors,
} from './request';
import { buildMonitorSchema, createMonitors, MonitorSchema } from './monitor';
import { Monitor } from '../dsl/monitor';
import {
  progress,
  apiProgress,
  write,
  error,
  aborted,
  indent,
  safeNDJSONParse,
  done,
} from '../helpers';
import type { PushOptions, ProjectSettings } from '../common_types';
import { findSyntheticsConfig, readConfig } from '../config';

export async function push(monitors: Monitor[], options: PushOptions) {
  if (monitors.length === 0) {
    throw 'No Monitors found';
  }
  const duplicates = trackDuplicates(monitors);
  if (duplicates.size > 0) {
    throw error(formatDuplicateError(duplicates));
  }

  progress(`preparing all monitors`);
  const schemas = await buildMonitorSchema(monitors);

  progress(`creating all monitors`);
  for (const schema of schemas) {
    await pushMonitors({ schemas: [schema], keepStale: true, options });
  }

  progress(`deleting all stale monitors`);
  await pushMonitors({ schemas, keepStale: false, options });
  done('Pushed');
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
  try {
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
          write(yellow(formatStaleMonitors(failedStaleMonitors)));
        }
      }
    }
  } catch (e) {
    error(e);
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
    const config = await readConfig('asd');
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
    throw aborted(`Unable to find synthetics config file: ${configPath}`);
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
    if (process.env.TEST_OVERRIDE != null) {
      override = Boolean(process.env.TEST_OVERRIDE);
    } else {
      // Add an extra line to make it easier to read the prompt
      write('');
      ({ override } = await prompt<{ override: boolean }>({
        type: 'confirm',
        name: 'override',
        message: `Monitors were pushed under the '${settings.id}' project. Are you sure you want to push them under the new '${options.id}' (note that this will duplicate the monitors, the old ones being orphaned)`,
        initial: false,
      }));
    }
    if (!override) {
      throw aborted('Push command Aborted');
    }
  }
  if (override) {
    await overrideSettings(settings.id, options.id);
  }
}

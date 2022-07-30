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

import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { prompt } from 'enquirer';
import {
  ok,
  formatAPIError,
  formatFailedMonitors,
  formatNotFoundError,
} from './request';
import { buildMonitorSchema, createMonitors } from './monitor';
import { Monitor } from '../dsl/monitor';
import {
  progress,
  write,
  error,
  done,
  SYNTHETICS_PATH,
  aborted,
} from '../helpers';
import { PushOptions } from '../common_types';
import { ProjectSettings } from '../generator';

export async function push(monitors: Monitor[], options: PushOptions) {
  progress(`preparing all monitors`);
  const schemas = await buildMonitorSchema(monitors);
  try {
    progress(`creating all monitors`);
    const { body, statusCode } = await createMonitors(schemas, options);
    if (statusCode === 404) {
      throw formatNotFoundError(await body.text());
    }
    if (!ok(statusCode)) {
      const { error, message } = await body.json();
      throw formatAPIError(statusCode, error, message);
    }
    const { failedMonitors } = await body.json();
    if (failedMonitors.length > 0) {
      throw formatFailedMonitors(failedMonitors);
    }
    done('Pushed');
  } catch (e) {
    error(e);
  }
}

const PROJECT_SETTINGS_PATH = join(SYNTHETICS_PATH, 'project.json');
const INSTALLATION_HELP = `Run 'npx @elastic/synthetics init' to create project with default settings.`;

export async function loadSettings() {
  if (!existsSync(PROJECT_SETTINGS_PATH)) {
    throw error(`Aborted. Synthetics project not set up.

${INSTALLATION_HELP}`);
  }

  const contents = await readFile(PROJECT_SETTINGS_PATH, 'utf-8');
  return JSON.parse(contents) as ProjectSettings;
}

export function validateSettings(opts: PushOptions) {
  const INVALID = 'Aborted. Invalid synthetics project settings.';

  let reason = '';
  if (!opts.project) {
    reason = 'Set project id via CLI as `--project <id>`';
  } else if (!opts.locations && !opts.privateLocations) {
    reason = `Set default location for all monitors via
  - CLI as '--locations <values...> or --privateLocations <values...>'
  - Synthetics config file 'monitors.locations' | 'monitors.privateLocations' field`;
  } else if (!opts.schedule) {
    reason = `Set default schedule in minutes for all monitors via
  - CLI as '--schedule <mins>'
  - Synthetics config file 'monitors.schedule' field`;
  }

  if (!reason) return;

  throw error(`${INVALID}

${reason}

${INSTALLATION_HELP}`);
}

async function overrideSettings(project: string) {
  const settings = JSON.parse(await readFile(PROJECT_SETTINGS_PATH, 'utf-8'));
  settings.project = project;

  await writeFile(
    PROJECT_SETTINGS_PATH,
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
}

export async function catchIncorrectSettings(
  settings: ProjectSettings,
  options: PushOptions
) {
  let override = !settings.project;
  if (settings.project && settings.project !== options.project) {
    if (typeof process.env.TEST_OVERRIDE != null) {
      override = Boolean(process.env.TEST_OVERRIDE);
    } else {
      // Add an extra line to make it easier to read the prompt
      write('');
      ({ override } = await prompt<{ override: boolean }>({
        type: 'confirm',
        name: 'override',
        message: `Monitors were pushed under the '${settings.project}' project. Are you sure you want to push them under the new '${options.project}' (note that this will duplicate the monitors, the old ones being orphaned)`,
        initial: false,
      }));
    }
    if (!override) {
      throw aborted('Push command Aborted');
    }
  }
  if (override) {
    await overrideSettings(options.project);
  }
}

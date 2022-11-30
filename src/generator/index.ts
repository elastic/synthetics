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
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { bold, cyan, yellow } from 'kleur/colors';
import { join, relative, dirname, basename } from 'path';
// @ts-ignore-next-line: has no exported member 'Input'
import { prompt, Input } from 'enquirer';
import {
  getMonitorManagementURL,
  progress,
  write as stdWrite,
} from '../helpers';
import {
  getPackageManager,
  replaceTemplates,
  runCommand,
  cloudIDToKibanaURL,
} from './utils';
import { formatLocations, getLocations, groupLocations } from '../locations';
import { ALLOWED_SCHEDULES } from '../dsl/monitor';
import type { ProjectSettings } from '../common_types';

// Templates that are required for setting up new synthetics project
const templateDir = join(__dirname, '..', '..', 'templates');

type PromptOptions = ProjectSettings & {
  locations: Array<string>;
  privateLocations: Array<string>;
  schedule: number;
};

// exported for testing
export const REGULAR_FILES_PATH = [
  'journeys/example.journey.ts',
  'journeys/advanced-example-helpers.ts',
  'journeys/advanced-example.journey.ts',
  'lightweight/heartbeat.yml',
  '.github/workflows/run-synthetics.yml',
  'README.md',
];
export const CONFIG_PATH = 'synthetics.config.ts';

// Files to be overriden by default if the project is initialized multiple times
const DEFAULT_OVERRIDES = [CONFIG_PATH];

export class Generator {
  pkgManager = 'npm';
  constructor(public projectDir: string) {}

  async directory() {
    progress(
      `Initializing Synthetics project in '${
        relative(process.cwd(), this.projectDir) || '.'
      }'`
    );
    if (!existsSync(this.projectDir)) {
      await mkdir(this.projectDir);
    }
  }

  async questions() {
    if (process.env.TEST_QUESTIONS) {
      return JSON.parse(process.env.TEST_QUESTIONS);
    }

    const { onCloud } = await prompt<{ onCloud: string }>({
      type: 'confirm',
      name: 'onCloud',
      initial: 'y',
      message: 'Do you use Elastic Cloud',
    });
    const url = await new Input({
      header: onCloud
        ? yellow(
            'Get cloud.id from your deployment https://www.elastic.co/guide/en/cloud/current/ec-cloud-id.html'
          )
        : '',
      message: onCloud
        ? 'What is your cloud.id'
        : 'What is the url of your Kibana instance',
      name: 'url',
      required: true,
      result(value) {
        return onCloud ? cloudIDToKibanaURL(value) : value;
      },
    }).run();

    const auth = await new Input({
      name: 'auth',
      header: yellow(
        `Generate API key from Kibana ${getMonitorManagementURL(url)}`
      ),
      required: true,
      message: 'What is your API key',
    }).run();

    const allLocations = await getLocations({ url, auth });
    const locChoices = formatLocations(allLocations);
    if (locChoices.length === 0) {
      throw 'Follow the docs to set up your first private locations - https://www.elastic.co/guide/en/observability/current/uptime-set-up-choose-agent.html#private-locations';
    }

    const monitorQues = [
      {
        type: 'select',
        name: 'locations',
        hint: '(Use <space> to select, <return> to submit)',
        message: 'Select the locations where you want to run monitors',
        choices: locChoices,
        multiple: true,
        validate(value) {
          return value.length === 0 ? `Select at least one option.` : true;
        },
      },
      {
        type: 'select',
        name: 'schedule',
        message: 'Set default schedule in minutes for all monitors',
        initial: 3, // Index of the third array item which is 10 minutes
        choices: ALLOWED_SCHEDULES.map(String),
        required: true,
        result(value) {
          return Number(value) as any;
        },
      },
      {
        type: 'input',
        name: 'id',
        message: 'Choose project id to logically group monitors',
        initial: basename(this.projectDir),
      },
      {
        type: 'input',
        name: 'space',
        message: 'Choose the target Kibana space',
        initial: 'default',
      },
    ];

    // Split and group private and public locations from the answered list.
    const answers = await prompt<PromptOptions>(monitorQues);
    const { locations, privateLocations } = groupLocations(answers.locations);
    return { ...answers, url, locations, privateLocations };
  }

  async files(answers: PromptOptions) {
    const fileMap = new Map<string, string>();

    // Setup Synthetics config file
    fileMap.set(
      CONFIG_PATH,
      replaceTemplates(
        await readFile(join(templateDir, CONFIG_PATH), 'utf-8'),
        answers
      )
    );

    // Setup non-templated files
    Promise.all(
      REGULAR_FILES_PATH.map(async file => {
        fileMap.set(file, await readFile(join(templateDir, file), 'utf-8'));
      })
    ).catch(e => {
      throw e;
    });

    // Create files
    for (const [relativePath, content] of fileMap) {
      await this.createFile(relativePath, content);
    }
  }

  async createFile(relativePath: string, content: string, override = false) {
    const absolutePath = join(this.projectDir, relativePath);

    if (
      !override &&
      !DEFAULT_OVERRIDES.includes(relativePath) &&
      existsSync(absolutePath)
    ) {
      const { override } = await prompt<{ override: boolean }>({
        type: 'confirm',
        name: 'override',
        message: `File ${relativePath} already exists. Override it?`,
        initial: false,
      });
      if (!override) return;
    }

    progress(`Writing ${relative(process.cwd(), absolutePath)}.`);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf-8');
  }

  async package() {
    this.pkgManager = await getPackageManager(this.projectDir);
    const commands = new Map<string, string>();
    commands.set(
      `Setting up project using ${this.pkgManager == 'yarn' ? 'Yarn' : 'NPM'}`,
      this.pkgManager == 'yarn' ? 'yarn init -y' : 'npm init -y'
    );

    const pkgName = '@elastic/synthetics';
    commands.set(
      `Installing @elastic/synthetics library`,
      this.pkgManager == 'yarn'
        ? `yarn add -dev ${pkgName} --silent`
        : `npm i -d ${pkgName} --quiet`
    );

    // Execute commands
    for (const [name, command] of commands) {
      progress(`${name}...`);
      execSync(command, {
        stdio: 'inherit',
        cwd: this.projectDir,
      });
    }
  }

  async patchPkgJSON() {
    const filename = 'package.json';
    const pkgJSON = JSON.parse(
      await readFile(join(this.projectDir, filename), 'utf-8')
    );

    if (!pkgJSON.scripts) {
      pkgJSON.scripts = {};
    }
    // Add test command
    pkgJSON.scripts.test = 'npx @elastic/synthetics journeys';

    // Add push command
    pkgJSON.scripts.push = 'npx @elastic/synthetics push';

    await this.createFile(
      filename,
      JSON.stringify(pkgJSON, null, 2) + '\n',
      true
    );
  }

  async patchGitIgnore() {
    const gitIgnorePath = join(this.projectDir, '.gitignore');
    let gitIgnore = '';
    if (existsSync(gitIgnorePath)) {
      const contents = await readFile(gitIgnorePath, 'utf-8');
      gitIgnore += contents.trimEnd() + '\n';
    }
    if (!gitIgnore.includes('node_modules')) {
      gitIgnore += 'node_modules/\n';
    }
    gitIgnore += '.synthetics/\n';
    await writeFile(gitIgnorePath, gitIgnore, 'utf-8');
  }

  banner() {
    stdWrite(
      bold(`
All set, you can run below commands inside: ${this.projectDir}:

  Run synthetic tests: ${cyan(runCommand(this.pkgManager, 'test'))}

  Push monitors to Kibana: ${cyan(
    'SYNTHETICS_API_KEY=<value> ' + runCommand(this.pkgManager, 'push')
  )}

  ${yellow(
    'Make sure to configure the SYNTHETICS_API_KEY before pushing monitors to Kibana.'
  )}

Visit https://www.elastic.co/guide/en/observability/current/synthetic-run-tests.html to learn more.
    `)
    );
  }

  async setup() {
    await this.directory();
    const answers = await this.questions();
    await this.package();
    await this.files(answers);
    await this.patchPkgJSON();
    await this.patchGitIgnore();
    this.banner();
  }
}

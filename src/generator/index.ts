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
import { progress, write as stdWrite } from '../helpers';
import { getPackageManager, runCommand } from './utils';

// Templates that are required for setting up new
// synthetics project
const templateDir = join(__dirname, '..', '..', 'templates');

export class Generator {
  pkgManager = 'npm';
  constructor(public projectDir: string) {}

  async directory() {
    if (!existsSync(this.projectDir)) {
      await mkdir(this.projectDir);
    }
  }

  async files() {
    const fileMap = new Map<string, string>();
    // Setup Synthetics config file
    const configFile = 'synthetics.config.ts';
    fileMap.set(
      configFile,
      await readFile(join(templateDir, configFile), 'utf-8')
    );

    // Setup example journey file
    const journeyFile = 'journeys/example.journey.ts';
    fileMap.set(
      journeyFile,
      await readFile(join(templateDir, journeyFile), 'utf-8')
    );
    // Setup gitignore
    fileMap.set(
      '.gitignore',
      await readFile(join(templateDir, '.gitignore'), 'utf-8')
    );

    // Create files
    for (const [relativePath, content] of fileMap) {
      await this.createFile(relativePath, content);
    }
  }

  async createFile(relativePath: string, content: string, override = false) {
    const absolutePath = join(this.projectDir, relativePath);
    if (override || !existsSync(absolutePath)) {
      progress(`Writing ${relative(process.cwd(), absolutePath)}.`);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf-8');
    }
  }

  async package() {
    this.pkgManager = await getPackageManager(this.projectDir);
    const commands = new Map<string, string>();
    commands.set(
      `Initializing Synthetics project using ${
        this.pkgManager == 'yarn' ? 'Yarn' : 'NPM'
      }`,
      this.pkgManager == 'yarn' ? 'yarn init -y' : 'npm init -y'
    );

    const pkgName = '@elastic/synthetics';
    commands.set(
      `Installing @elastic/synthetics library`,
      this.pkgManager == 'yarn'
        ? `yarn add -dev ${pkgName}`
        : `npm i -d ${pkgName}`
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
    const project = basename(this.projectDir);
    pkgJSON.scripts.push = `npx @elastic/synthetics push journeys --project ${project} --url http://localhost:5601 --auth apiKey`;

    await this.createFile(
      filename,
      JSON.stringify(pkgJSON, null, 2) + '\n',
      true
    );
  }

  banner() {
    stdWrite(
      bold(`
All set, you can run below commands inside: ${this.projectDir}:

  Run synthetic tests: ${cyan(runCommand(this.pkgManager, 'test'))}

  Push monitors to Kibana: ${cyan(runCommand(this.pkgManager, 'push'))}

  ${yellow(
    'Make sure to update the Kibana url and api keys before pushing monitors to Kibana.'
  )}

Visit https://www.elastic.co/guide/en/observability/master/synthetics-journeys.html to learn more.
    `)
    );
  }

  async setup() {
    await this.directory();
    await this.package();
    await this.files();
    await this.patchPkgJSON();
    this.banner();
  }
}

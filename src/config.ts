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

import { isAbsolute, resolve, dirname } from 'path';
import { SyntheticsConfig } from './common_types';
import { isFile } from './helpers';

export function readConfig(env: string, config?: string): SyntheticsConfig {
  let options = {};
  const cwd = process.cwd();
  /**
   * If config is passed via `--config` flag, try to resolve it relative to the
   * current working directory
   */
  if (typeof config === 'string') {
    const configPath = resolveConfigPath(config, cwd);
    options = readAndParseConfig(configPath);
  } else {
    /**
     * resolve to `synthetics.config.js` and `synthetics.config.ts`
     * recursively till root
     */
    const configPath = findSyntheticsConfig(cwd, cwd);
    configPath && (options = readAndParseConfig(configPath));
  }
  if (typeof options === 'function') {
    options = options(env);
  }
  return options;
}

function resolveConfigPath(configPath: string, cwd: string) {
  const absolutePath = isAbsolute(configPath)
    ? configPath
    : resolve(cwd, configPath);

  if (isFile(absolutePath)) {
    return absolutePath;
  }
  throw new Error('Synthetics config file does not exist: ' + absolutePath);
}

function interopRequireDefault(obj: any) {
  return obj && obj.__esModule ? obj : { default: obj };
}

function readAndParseConfig(configPath) {
  try {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const requiredModule = require(configPath);
    return interopRequireDefault(requiredModule).default;
  } catch (e) {
    throw new Error('Unable to read synthetics config: ' + configPath);
  }
}

function getConfigFile(ext: string) {
  return 'synthetics.config' + ext;
}

function findSyntheticsConfig(resolvePath, cwd) {
  const configPath = ['.js', '.ts']
    .map(ext => resolve(resolvePath, getConfigFile(ext)))
    .find(isFile);
  if (configPath) {
    return configPath;
  }
  const parentDirectory = dirname(resolvePath);
  /**
   * We are in the system root, so return empty path and fallback
   * to empty suite params
   */
  if (resolvePath === parentDirectory) {
    return '';
  }
  return findSyntheticsConfig(parentDirectory, cwd);
}

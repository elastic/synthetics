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

import {
  formatAPIError,
  formatNotFoundError,
  sendRequest,
  ok,
} from '../push/request';
import { indent, removeTrailingSlash, write } from '../helpers';

export type LocationCmdOptions = {
  auth: string;
  url: string;
};

type LocationMetadata = {
  id: string;
  label: string;
  isServiceManaged: boolean;
};

export type LocationAPIResponse = {
  locations: Array<LocationMetadata>;
};

const PRIVATE_KEYWORD = '(private)';

export async function getLocations(options: LocationCmdOptions) {
  const url =
    removeTrailingSlash(options.url) + '/internal/uptime/service/locations';
  const { body, statusCode } = await sendRequest({
    url,
    method: 'GET',
    auth: options.auth,
  });
  if (statusCode === 404) {
    throw formatNotFoundError(await body.text());
  }
  if (!ok(statusCode)) {
    const { error, message } = await body.json();
    throw formatAPIError(statusCode, error, message);
  }
  return ((await body.json()) as LocationAPIResponse).locations;
}

export function formatLocations(locations: Array<LocationMetadata>) {
  const formatted: Array<string> = [];
  for (const location of locations) {
    let name = location.label;
    if (location.isServiceManaged) {
      [, name] = name.split('-');
      name = name.toLowerCase().trim().split(' ').join('_');
    } else {
      name = `${name}${PRIVATE_KEYWORD}`;
    }
    formatted.push(name);
  }
  return formatted;
}

export function groupLocations(locations: Array<string>) {
  const grouped = { locations: [], privateLocations: [] };
  for (const loc of locations) {
    if (loc.includes(PRIVATE_KEYWORD)) {
      grouped.privateLocations.push(loc.replace(PRIVATE_KEYWORD, ''));
    } else {
      grouped.locations.push(loc);
    }
  }
  return grouped;
}

export function renderLocations(locations: Array<string>) {
  let outer = 'Available locations: \n';
  let inner = '';
  for (const location of locations) {
    inner += `* ${location}\n`;
  }
  outer += indent(inner);
  outer += `\nSet default location for monitors via
  - Synthetics config file 'monitors.locations' | 'monitors.privateLocations' field
  - Monitor API 'monitor.use({ locations: ["japan"], privateLocations: ["custom-location"] }')`;

  write(outer);
}

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

import { removeTrailingSlash } from '../helpers';
import {
  formatAPIError,
  formatNotFoundError,
  sendRequest,
  ok,
} from '../push/request';

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
  const resp: LocationAPIResponse = await body.json();
  return resp.locations;
}

export function formatLocations(locations: Array<LocationMetadata>) {
  const formatted: Array<string> = [];
  for (const location of locations) {
    let [, name] = location.label.split('-');
    name = name.toLowerCase().trim().split(' ').join('_');
    if (!location.isServiceManaged) {
      name = `${name}(private)`;
    }
    formatted.push(name);
  }
  return formatted;
}

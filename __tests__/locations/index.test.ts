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

import { Server } from '../utils/server';
import {
  formatLocations,
  getLocations,
  groupLocations,
} from '../../src/locations';
import { LOCATIONS } from '../fixtures/locationinfo';

describe('Locations', () => {
  let server: Server;
  beforeAll(async () => {
    server = await Server.create();
    server.route('/internal/uptime/service/locations', (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ locations: LOCATIONS }));
    });
  });
  afterAll(async () => {
    await server.close();
    process.env.NO_COLOR = '';
  });

  it('get locations', async () => {
    const locations = await getLocations({
      url: `${server.PREFIX}`,
      auth: 'apiKey',
    });
    expect(locations.length).toBe(4);
  });

  it('format and group locations by labels', async () => {
    const locations = await getLocations({
      url: `${server.PREFIX}`,
      auth: 'apiKey',
    });
    const formatted = formatLocations(locations);
    expect(formatted).toEqual([
      'japan',
      'custom location 1(private)',
      'custom location 2(private)',
      'us_west',
    ]);

    expect(groupLocations(formatted)).toEqual({
      locations: ['japan', 'us_west'],
      privateLocations: [
        'custom location 1(private)',
        'custom location 2(private)',
      ],
    });
  });
});

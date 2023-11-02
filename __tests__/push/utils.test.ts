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

import { normalizeMonitorName } from '../../src/push/utils';

describe('Push Utils', () => {
  it("normalize monitor's name", () => {
    expect(normalizeMonitorName('test monitor-name')).toBe('test monitor-name');
    expect(normalizeMonitorName('https://example.com')).toBe(
      'https__example_com'
    );
    expect(normalizeMonitorName('https://todoapp.example.com/../')).toBe(
      'https__todoapp_example_com____'
    );
    expect(normalizeMonitorName('/x/y/z')).toBe('_x_y_z');
    expect(normalizeMonitorName('x.y.z')).toBe('x_y_z');
    expect(normalizeMonitorName('foo:bar:blah')).toBe('foo_bar_blah');
  });
});

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

import { getSizedChunks, normalizeMonitorName } from '../../src/push/utils';

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

  describe('getSizedChunks', () => {
    it('should return empty array when input is empty', () => {
      expect(getSizedChunks([], 100, 100)).toEqual([]);
    });

    it('should return chunks of input array based on maxChunkSizeKB', () => {
      const input = [
        { size: 10 },
        { size: 20 },
        { size: 30 },
        { size: 40 },
        { size: 50 },
        { size: 60 },
      ];
      expect(getSizedChunks(input, 1000, 100)).toEqual([input]);
      expect(getSizedChunks(input, 100, 3)).toEqual([
        [input[0], input[1], input[2]],
        [input[3], input[4]],
        [input[5]],
      ]);
      expect(getSizedChunks(input, 100, 2)).toEqual([
        [input[0], input[1]],
        [input[2], input[3]],
        [input[4]],
        [input[5]],
      ]);
    });
  });
});

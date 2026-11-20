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

import { transform, installLoaders } from '../../src/core/transform';

describe('custom loaders', () => {
  it('transforms custom extensions with the configured loader', () => {
    const revert = installLoaders({ '.svg': 'text' });
    try {
      const { code } = transform('<svg>MARKER_SVG</svg>', '/tmp/logo.svg');
      const mod = { exports: {} as any };
      new Function('module', 'exports', code)(mod, mod.exports);
      expect(mod.exports.default ?? mod.exports).toBe('<svg>MARKER_SVG</svg>');
    } finally {
      revert();
    }
  });

  it('stops applying custom loaders once reverted', () => {
    installLoaders({ '.svg': 'text' })();
    expect(() => transform('<svg>MARKER_SVG</svg>', '/tmp/logo.svg')).toThrow();
  });

  it('rejects loaders that emit extra files or invalid extensions', () => {
    expect(() => installLoaders({ '.svg': 'file' })).toThrow(
      'Invalid bundler.loader entry'
    );
    expect(() => installLoaders({ '.css': 'css' })).toThrow();
    expect(() => installLoaders({ svg: 'text' })).toThrow();
  });
});

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

import { createHash } from 'crypto';
import type { Matrix } from './common_types';

export const getCombinations = (matrix: Matrix): Array<Record<string, unknown>> => {
  const { values, adjustments } = matrix;
  const matrixKeys = Object.keys(matrix.values);
  const entries = Object.values(values);

  let combinations = calculateCombinations(entries[0]);
  for (let i = 1; i < entries.length; i++) {
    combinations = calculateCombinations(combinations, entries[i]);
  }

  const matrixParams = combinations.map(combination => {
    return getCombinationParams(matrixKeys, combination);
  });

  if (!adjustments) {
    return matrixParams;
  }

  const currentCombinations = new Set(matrixParams.map(params => {
    const hash = createHash('sha256');
    const paramHash = hash.update(JSON.stringify(params)).digest('base64');
    return paramHash;
  }));

  adjustments.forEach(adjustment => {
    const hash = createHash('sha256');
    const adjustmentHash = hash.update(JSON.stringify(adjustment)).digest('base64');
    if (!currentCombinations.has(adjustmentHash)) {
      matrixParams.push(adjustment);
    }
  });

  return matrixParams;
}

export const calculateCombinations = (groupA: Array<unknown | unknown[]>, groupB?: Array<unknown>): Array<unknown[]> => {
  const results = [];
  groupA.forEach(optionA => {
    if (!groupB) {
      results.push([optionA]);
      return;
    }
    groupB.forEach(optionB => {
      if (Array.isArray(optionA)) {
        return results.push([...optionA, optionB])
      } else {
        return results.push([optionA, optionB])
      }
    });
  });
  return results;
}

export const getCombinationName = (name: string, combinations: Record<string, unknown>) => {
  const values = Object.values(combinations);
  return values.reduce<string>((acc, combination) => {
    const nameAdjustment = typeof combination === 'object' ? JSON.stringify(combination) : combination.toString();
    acc += ` - ${nameAdjustment.toString()}`;
    return acc;
  }, name).trim();
}

export const getCombinationParams = (keys: string[], values: unknown[]): Record<string, unknown> => {
  return keys.reduce<Record<string, unknown>>((acc, key, index) => {
    acc[key] = values[index];
    return acc;
  }, {});
}

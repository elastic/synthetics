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

import { Location, StatusValue, VoidCallback } from '../common_types';

export class Step {
  readonly name: string;
  readonly index: number;
  readonly callback: VoidCallback;
  readonly location?: Location;
  skip = false;
  soft = false;
  only = false;
  _startTime = 0;
  duration = -1;
  status: StatusValue = 'succeeded';
  error?: Error;
  url?: string;

  constructor(
    name: string,
    index: number,
    callback: VoidCallback,
    location: Location
  ) {
    this.name = name;
    this.index = index;
    this.callback = callback;
    this.location = location;
  }
}

type StepType = (name: string, callback: VoidCallback) => Step;

export type StepWithAnnotations = StepType & {
  /**
   * Skip this step on the journey
   */
  skip: StepType;
  /**
   * Failure of soft step will not skip rest of the steps in the journey
   */
  soft: StepType;
  /**
   * Run only this step and skip rest of the steps in the journey
   */
  only: StepType;
};

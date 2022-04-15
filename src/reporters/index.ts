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

import BaseReporter from './base';
import JSONReporter from './json';
import JUnitReporter from './junit';
import { Journey, Step } from '../dsl';
import {
  StartEvent,
  JourneyEndResult,
  JourneyStartResult,
  StepEndResult,
} from '../common_types';

export type ReporterOptions = { fd?: number; colors?: boolean };
export type BuiltInReporter = 'default' | 'json' | 'junit';
export type ReporterInstance = new (opts: ReporterOptions) => Reporter;
export const reporters: {
  [key in BuiltInReporter]: ReporterInstance;
} = {
  default: BaseReporter,
  json: JSONReporter,
  junit: JUnitReporter,
};

export interface Reporter {
  onStart?(params: StartEvent): void;
  onJourneyRegister?(journey: Journey): void;
  onJourneyStart?(journey: Journey, result: JourneyStartResult): void;
  onStepStart?(journey: Journey, step: Step): void;
  onStepEnd?(journey: Journey, step: Step, result: StepEndResult): void;
  onJourneyEnd?(
    journey: Journey,
    result: JourneyEndResult
  ): void | Promise<void>;
  onEnd?(): void | Promise<void>;
}

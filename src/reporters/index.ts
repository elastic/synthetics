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
import { APIJourney, Journey, Step } from '../dsl';
import {
  StartEvent,
  JourneyEndResult,
  JourneyStartResult,
  StepEndResult,
  APIJourneyEndResult,
} from '../common_types';
import BuildKiteCLIReporter from './build_kite_cli';
import APIJSONReporter from './api-json';

export type ReporterOptions = {
  fd?: number;
  colors?: boolean;
  dryRun?: boolean;
};
export type BuiltInReporterName =
  | 'default'
  | 'json'
  | 'apiJson'
  | 'junit'
  | 'buildkite-cli';
export type ReporterInstance = new (opts: ReporterOptions) => Reporter;
export const reporters: {
  [key in BuiltInReporterName]: ReporterInstance;
} = {
  default: BaseReporter,
  json: JSONReporter,
  apiJson: APIJSONReporter,
  junit: JUnitReporter,
  // 'api-default': APIReporter,
  'buildkite-cli': BuildKiteCLIReporter,
};

export interface Reporter {
  onStart?(params: StartEvent): void;
  onJourneyRegister?(journey: Journey | APIJourney): void;
  onJourneyStart?(
    journey: Journey | APIJourney,
    result: JourneyStartResult
  ): void;
  onStepStart?(journey: Journey | APIJourney, step: Step): void;
  onStepEnd?(
    journey: Journey | APIJourney,
    step: Step,
    result: StepEndResult
  ): void;
  onJourneyEnd?(
    journey: Journey | APIJourney,
    result: JourneyEndResult | APIJourneyEndResult
  ): void | Promise<void>;
  onEnd?(): void | Promise<void>;
}

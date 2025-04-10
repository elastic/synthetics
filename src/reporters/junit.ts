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

import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { JourneyEndResult, JourneyStartResult } from '../common_types';
import { Journey, Step } from '../dsl';
import { indent, now } from '../helpers';
import BaseReporter from './base';
import { serializeError, stripAnsiCodes } from './reporter-util';

type XMLEntry = {
  name: string;
  attributes?: {
    name: string;
    timestamp?: number;
    classname?: string;
    time?: number;
    tests?: number;
    failures?: number;
    skipped?: number;
    errors?: number;
  };
  children?: XMLEntry[];
  text?: string;
};

/**
 * JUnit Reporting Format - https://llg.cubic.org/docs/junit/
 */
export default class JUnitReporter extends BaseReporter {
  private totalTests = 0;
  private totalFailures = 0;
  private totalSkipped = 0;
  #journeyMap = new Map<string, XMLEntry>();

  override onJourneyStart(journey: Journey, {}: JourneyStartResult) {
    if (!this.#journeyMap.has(journey.name)) {
      const entry = {
        name: 'testsuite',
        attributes: {
          name: journey.name,
          tests: 0,
          failures: 0,
          skipped: 0,
          errors: 0,
        },
        children: [],
      };
      this.#journeyMap.set(journey.name, entry);
    }
  }

  override onStepEnd(journey: Journey, step: Step) {
    if (!this.#journeyMap.has(journey.name)) {
      return;
    }
    const entry = this.#journeyMap.get(journey.name);
    const caseEntry = {
      name: 'testcase',
      attributes: {
        name: step.name,
        classname: journey.name + ' ' + step.name,
        time: step.duration,
      },
      children: [],
    };

    entry.attributes.tests++;
    if (step.status === 'failed') {
      caseEntry.children.push({
        name: 'failure',
        attributes: {
          message: step.error?.message,
          type: step.error?.name,
        },
        text: stripAnsiCodes(serializeError(step.error).stack),
      });
      entry.attributes.failures++;
    } else if (step.status === 'skipped') {
      caseEntry.children.push({
        name: 'skipped',
        attributes: {
          message: 'previous step failed',
        },
      });
      entry.attributes.skipped++;
    }
    entry.children.push(caseEntry);
  }

  override onJourneyEnd(journey: Journey, {}: JourneyEndResult) {
    if (!this.#journeyMap.has(journey.name)) {
      return;
    }
    const { attributes } = this.#journeyMap.get(journey.name);
    this.totalTests += attributes.tests;
    this.totalFailures += attributes.failures;
    this.totalSkipped += attributes.skipped;
  }

  override async onEnd() {
    const root: XMLEntry = {
      name: 'testsuites',
      attributes: {
        name: '',
        tests: this.totalTests,
        failures: this.totalFailures,
        skipped: this.totalSkipped,
        errors: 0,
        time: parseInt(String(now())) / 1000,
      },
      children: [...this.#journeyMap.values()],
    };

    const output = serializeEntries(root).join('\n');
    /**
     * write the xml output to a file if specified via env flag
     */
    const fileName = process.env['SYNTHETICS_JUNIT_FILE'];
    if (fileName) {
      await mkdir(dirname(fileName), { recursive: true });
      await writeFile(fileName, output);
    } else {
      this.write(output);
    }
  }
}

function escape(text: string): string {
  return text
    .replace(/"/g, '&quot;')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function serializeEntries(entry: XMLEntry, tokens: string[] = [], space = '') {
  tokens.push(
    indent(
      `<${entry.name} ${Object.entries(entry.attributes || {})
        .map(([key, value]) => `${key}="${escape(String(value))}"`)
        .join(' ')}>`,
      space
    )
  );
  for (const child of entry.children || []) {
    serializeEntries(child, tokens, space + '   ');
  }
  if (entry.text) tokens.push(indent(escape(entry.text), space));
  tokens.push(indent(`</${entry.name}>`, space));
  return tokens;
}

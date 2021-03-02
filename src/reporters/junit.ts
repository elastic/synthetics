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

import { formatError, now } from '../helpers';
import BaseReporter from './base';

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

export default class JUnitReporter extends BaseReporter {
  private totalTests = 0;
  private totalFailures = 0;
  private totalSkipped = 0;

  _registerListeners() {
    const journeyMap = new Map<string, XMLEntry>();

    this.runner.on('journey:start', ({ journey }) => {
      if (!journeyMap.has(journey.name)) {
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
        journeyMap.set(journey.name, entry);
      }
    });

    this.runner.on(
      'step:end',
      ({ journey, step, status, error, start, end }) => {
        if (!journeyMap.has(journey.name)) {
          return;
        }
        const entry = journeyMap.get(journey.name);
        const caseEntry = {
          name: 'testcase',
          attributes: {
            name: step.name,
            classname: step.name + ' ' + journey.name,
            time: end - start,
          },
          children: [],
        };

        entry.attributes.tests++;
        if (status === 'failed') {
          const { name, message, stack } = formatError(error);
          caseEntry.children.push({
            name: 'failure',
            attributes: {
              message,
              type: name,
            },
            text: stack,
          });
          entry.attributes.failures++;
        } else if (status === 'skipped') {
          caseEntry.children.push({
            name: 'skipped',
            message: 'previous step failed',
          });
          entry.attributes.skipped++;
        }
        entry.children.push(caseEntry);
      }
    );

    this.runner.on('journey:end', ({ journey }) => {
      if (!journeyMap.has(journey.name)) {
        return;
      }
      const { attributes } = journeyMap.get(journey.name);
      this.totalTests += attributes.tests;
      this.totalFailures += attributes.failures;
      this.totalSkipped += attributes.skipped;
    });

    this.runner.on('end', () => {
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
        children: [...journeyMap.values()],
      };
      const tokens = serializeXML(root);
      const output = tokens.join('\n');
      this.write(output);
    });
  }
}

function escape(text: string): string {
  return text
    .replace(/"/g, '&quot;')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function serializeXML(entry: XMLEntry, tokens: string[] = []) {
  const xmlAttributes: string[] = [];
  for (const name of Object.keys(entry.attributes || {})) {
    xmlAttributes.push(`${name}="${escape(String(entry.attributes[name]))}"`);
  }
  tokens.push(`<${entry.name} ${xmlAttributes.join(' ')}>`);
  for (const child of entry.children || []) {
    serializeXML(child, tokens);
  }
  if (entry.text) tokens.push(escape(entry.text));
  tokens.push(`</${entry.name}>`);

  return tokens;
}

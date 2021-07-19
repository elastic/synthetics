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
import type { NodeResult, ImpactValue } from 'axe-core';
import AxeBuilder from '@axe-core/playwright';

import { Page } from 'playwright-chromium';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

interface AccessibilityViolationMetadata {
  id: string,
  tags: string[],
  help: string;
  helpUrl: string;
}

type AccessibilityViolation = AccessibilityViolationMetadata & {
  html: string;
  impact: ImpactValue;
  failureSummary: string;
  timestamp: number;
  step: Pick<Step, 'name' | 'index'>;
}

export type AccessibilityReport = {
  violations: AccessibilityViolation[]
}

export class Accessibility {
  _currentStep: Partial<Step> = null;

  constructor(private page: Page) {}

  private accessibilityNodeProcessor(nodes: NodeResult[], metadata: AccessibilityViolationMetadata): AccessibilityViolation[] {
    const { name, index } = this._currentStep;

    return nodes.map(({ html, impact, failureSummary }) => ({
      ...metadata,
      timestamp: getTimestamp(),
      html, 
      impact,
      failureSummary,
      step: { name, index },
    }));
  }

  public async getViolations(): Promise<AccessibilityReport> {
    if (!this._currentStep) {
      return;
    }
    const { violations: axeViolations } = await new AxeBuilder({ page: this.page as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).analyze();

    const violations = axeViolations.reduce((prevViolations, { id, tags, help, helpUrl, nodes }) => {
      return [
        ...prevViolations,
        ...this.accessibilityNodeProcessor(
          nodes, 
          {
            id, tags, help, helpUrl
          }
        )
      ];
    }, []);

    return { violations };
  }
}

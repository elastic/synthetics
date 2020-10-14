import { Browser, Page, BrowserContext, CDPSession } from 'playwright';
import { Step } from './step';
import { noop } from '../helpers';
import { VoidCallback } from '../common_types';

export type JourneyOptions = {
  name: string;
  id?: string;
};

type HookType = 'before' | 'after';
export type Hooks = Record<HookType, VoidCallback>;

export type JourneyCallback = (options: {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Record<string, any>;
}) => Promise<void>;

export class Journey {
  name: string;
  id?: string;
  callback: JourneyCallback;
  steps: Step[] = [];
  hooks: Hooks = {
    before: noop,
    after: noop,
  };

  constructor(options: JourneyOptions, callback: JourneyCallback) {
    this.name = options.name;
    this.id = options.id;
    this.callback = callback;
  }

  addStep(name: string, callback: VoidCallback) {
    const step = new Step(name, this.steps.length + 1, callback);
    this.steps.push(step);
    return step;
  }

  addHook(type: HookType, callback: VoidCallback) {
    this.hooks[type] = callback;
  }
}

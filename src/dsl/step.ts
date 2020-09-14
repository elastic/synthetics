import { Browser, Page, BrowserContext } from 'playwright';

export type StepCallback = (
  page: Page,
  params: Record<string, any>,
  options: {
    context: BrowserContext;
    browser: Browser;
  }
) => Promise<void>;

export class Step {
  name: string;
  index: number;
  callback: StepCallback;

  constructor(name: string, index: number, callback: StepCallback) {
    this.name = name;
    this.index = index;
    this.callback = callback;
  }
}

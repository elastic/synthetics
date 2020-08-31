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
  callback: StepCallback;

  constructor(name: string, callback: StepCallback) {
    this.name = name;
    this.callback = callback;
  }
}

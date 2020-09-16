import { Browser, Page, BrowserContext, CDPSession } from 'playwright';

export type StepCallback = (options: {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  client: CDPSession;
  params: Record<string, any>;
}) => Promise<void>;

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

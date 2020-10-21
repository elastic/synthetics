import { Page } from 'playwright';
import { Step } from '../dsl';
import { getTimestamp } from '../helpers';

export interface BrowserMessage {
  timestamp: number;
  text: string;
  type: string;
  step: { name: string; index: number };
}

const defaultMessageLimit = 1000;

export class BrowserConsole {
  private messages: BrowserMessage[] = [];
  public currentStep: Partial<Step> = null;
  private consoleEventListener = async msg => {
    if (this.currentStep) {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        const { name, index } = this.currentStep;
        this.messages.push({
          timestamp: getTimestamp(),
          text: msg.text(),
          type,
          step: { name, index },
        });
        if (this.messages.length > defaultMessageLimit) {
          this.messages.splice(0, 1);
        }
      }
    }
  };

  constructor(private page: Page) {}

  start() {
    this.page.on('console', this.consoleEventListener);
  }

  stop() {
    this.page.removeListener('console', this.consoleEventListener);
    return this.messages;
  }
}

import { Page } from 'playwright';
import { getTimestamp } from '../helpers';

export interface BrowserMessage {
  timestamp: number;
  text: string;
  type: string;
}

export class BrowserConsole {
  private messages: BrowserMessage[] = [];
  private consoleEventListener = async msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      this.messages.push({
        timestamp: getTimestamp(),
        text: msg.text(),
        type,
      });
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

import { Page, BrowserContext, Browser } from 'playwright';
export type StepCallback = (page: Page, params: any, {context: BrowserContext, browser: Browser}) => void;

export class Step {
    name: string
    callback: StepCallback

    constructor(name: string, callback: StepCallback) {
        this.name = name;
        this.callback = callback;
    }
}
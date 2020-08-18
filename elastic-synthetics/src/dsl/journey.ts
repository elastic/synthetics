import { Step } from './step';

export type JourneyOptions = {
    name: string,
    id?: string
}

export type JourneyCallback = () => void;

export class Journey {
    options: JourneyOptions
    callback: JourneyCallback
    steps: Step[] = []

    constructor(options: JourneyOptions, callback: JourneyCallback) {
        this.options = options;
        this.callback = callback;
    }
}

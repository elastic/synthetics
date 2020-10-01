import { Step, StepCallback } from './step';

export type JourneyOptions = {
  name: string;
  id?: string;
};

export type JourneyCallback = () => void;

export class Journey {
  options: JourneyOptions;
  callback: JourneyCallback;
  steps: Step[] = [];

  constructor(options: JourneyOptions, callback: JourneyCallback) {
    this.options = options;
    this.callback = callback;
  }

  addStep(name: string, callback: StepCallback) {
    const step = new Step(name, this.steps.length + 1, callback);
    this.steps.push(step);
    return step;
  }
}

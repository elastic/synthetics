import { Step, StepCallback } from './step';
import * as minimatch from 'minimatch';

export type JourneyOptions = {
  name: string;
  id?: string;
  tags?: string[];
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

  matches({ names, tags }: { names?: string[]; tags?: string[] }) {
    return (
      (names ?? []).some(n => minimatch(this.options.name, n)) &&
      (tags ?? []).some(glob => this.options.tags.some(t => minimatch(t, glob)))
    );
  }
}

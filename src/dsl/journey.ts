import { Step, StepCallback } from './step';
import { match } from 'minimatch';

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

  matches({
    nameGlobs,
    tagGlobs,
  }: {
    nameGlobs?: string[];
    tagGlobs?: string[];
  }): boolean {
    if (nameGlobs && !this.nameMatches(nameGlobs)) {
      return false;
    }
    if (tagGlobs && !this.tagsMatch(tagGlobs)) {
      return false;
    }

    return true;
  }

  nameMatches(globs: string[]): boolean {
    return globs.some(glob => match([this.options.name], glob).length > 0);
  }

  tagsMatch(globs: string[]): boolean {
    return globs.some(glob => match(this.options.tags, glob).length > 0);
  }
}

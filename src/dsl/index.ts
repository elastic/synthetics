import { Journey, JourneyCallback, JourneyOptions } from './journey';
import { Step, StepCallback } from './step';
import Runner from './runner';

export const runner = new Runner();

let stepIndex = 0; // Tracks the current step index

export const journey = (
  options: JourneyOptions | string,
  callback: JourneyCallback
) => {
  if (typeof options === 'string') {
    options = { name: options, id: options };
  }
  const j = new Journey(options, callback);
  runner.addJourney(j);
  stepIndex = 0;
  // load steps
  j.callback();
  return j;
};

export const step = (name: string, callback: StepCallback) => {
  const step = new Step(name, stepIndex, callback);
  runner.addStep(step);
  stepIndex++; // Increment the step index counter for the next step
  return step;
};

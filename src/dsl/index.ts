import { Journey, JourneyCallback, JourneyOptions } from './journey';
import { Step, StepCallback } from './step';
import Runner from './runner';

export const runner = new Runner();

export const journey = (
  options: JourneyOptions | string,
  callback: JourneyCallback
) => {
  if (typeof options === 'string') {
    options = { name: options, id: options };
  }
  const j = new Journey(options, callback);
  runner.addJourney(j);
  // load steps
  j.callback();
  return j;
};

export const step = (name: string, callback: StepCallback) => {
  const step = new Step(name, callback);
  runner.addStep(step);
  return step;
};

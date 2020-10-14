import { Journey, JourneyCallback, JourneyOptions } from '../dsl';
import Runner from './runner';
import { VoidCallback } from '../common_types';

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
  return j;
};

export const step = (name: string, callback: VoidCallback) => {
  return runner.currentJourney?.addStep(name, callback);
};

export const before = (callback: VoidCallback) => {
  return runner.currentJourney?.addHook('before', callback);
};

export const after = (callback: VoidCallback) => {
  return runner.currentJourney?.addHook('after', callback);
};

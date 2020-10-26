import { Journey, JourneyCallback, JourneyOptions } from '../dsl';
import Runner from './runner';
import { VoidCallback } from '../common_types';
import { log } from './logger';

export const runner = new Runner();

export const journey = (
  options: JourneyOptions | string,
  callback: JourneyCallback
) => {
  log(`register journey: ${options}`)
  if (typeof options === 'string') {
    options = { name: options, id: options };
  }
  const j = new Journey(options, callback);
  runner.addJourney(j);
  return j;
};

export const step = (name: string, callback: VoidCallback) => {
  log(`register step: ${name}`)
  return runner.currentJourney?.addStep(name, callback);
};

export const beforeAll = (callback: VoidCallback) => {
  runner.addHook('beforeAll', callback);
};

export const afterAll = (callback: VoidCallback) => {
  runner.addHook('afterAll', callback);
};

export const before = (callback: VoidCallback) => {
  if (!runner.currentJourney) {
    throw new Error('before is called outside of the journey context');
  }
  return runner.currentJourney.addHook('before', callback);
};

export const after = (callback: VoidCallback) => {
  if (!runner.currentJourney) {
    throw new Error('after is called outside of the journey context');
  }
  return runner.currentJourney.addHook('after', callback);
};

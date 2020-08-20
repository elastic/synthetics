import Runner from '../../src/dsl/runner';
import { Journey } from '../../src/dsl/journey';
import { Step } from '../../src/dsl/step';

const noop = () => {};
let runner: Runner;
beforeEach(() => {
  runner = new Runner();
});

it('support emitting/subscribing to events', () => {
  runner.on('start', ({ numJourneys }) => {
    expect(numJourneys).toBe(1);
  });
  runner.emit('start', { numJourneys: 1 });
});

it('add journey', () => {
  const noop = () => {};
  const j1 = new Journey({ name: 'j1' }, noop);
  const j2 = new Journey({ name: 'j2' }, noop);
  expect(runner.currentJourney).toBeNull();
  runner.addJourney(j1);
  expect(runner.currentJourney).toEqual(j1);
  runner.addJourney(j2);
  expect(runner.currentJourney).toEqual(j2);
  expect(runner.journeys.length).toBe(2);
});

it('add steps to current journey', () => {
  const s1 = new Step('step1', noop);
  const s2 = new Step('step2', noop);
  runner.addStep(s1);
  expect(runner.currentJourney).toBeNull();

  const j1 = new Journey({ name: 'j1' }, noop);
  runner.addJourney(j1);
  runner.addStep(s1);
  expect(runner.currentJourney.steps).toEqual([s1]);
  runner.addStep(s2);
  expect(runner.currentJourney.steps.length).toBe(2);
});

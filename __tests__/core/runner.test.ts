import Runner from '../../src/core/runner';
import { Journey } from '../../src/dsl';

const noop = async () => {};
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
  const j1 = new Journey({ name: 'j1' }, noop);
  const j2 = new Journey({ name: 'j2' }, noop);
  expect(runner.currentJourney).toBeNull();
  runner.addJourney(j1);
  expect(runner.currentJourney).toEqual(j1);
  runner.addJourney(j2);
  expect(runner.currentJourney).toEqual(j2);
  expect(runner.journeys.length).toBe(2);
});

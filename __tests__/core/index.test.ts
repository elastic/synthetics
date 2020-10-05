import { journey, step, runner } from '../../src/core/index';

beforeEach(() => runner.reset());

const noop = async () => {};
const name = 'journey';
it('add journeys to runner', () => {
  const j = journey(name, noop);

  expect(j.options.name).toBe(name);
  expect(j.options.id).toBe(name);
  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
});

it('add steps to journeys', () => {
  const j = journey(name, noop);
  const s1 = step('step1', noop);
  const s2 = step('step2', noop);

  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
  expect(runner.currentJourney.steps.length).toBe(2);
  expect(runner.currentJourney.steps).toEqual([s1, s2]);
});

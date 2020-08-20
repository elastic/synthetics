import { journey, step, runner } from '../../src/dsl';

beforeEach(() => runner.reset());

const name = 'journey';
it('add journeys to runner', () => {
  const j = journey(name, () => {});

  expect(j.options.name).toBe(name);
  expect(j.options.id).toBe(name);
  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
});

it('add steps to journeys', () => {
  let s1,
    s2 = null;
  const j = journey(name, () => {
    s1 = step('step1', () => {});
    s2 = step('step2', () => {});
  });

  expect(runner.currentJourney).toEqual(j);
  expect(runner.journeys.length).toBe(1);
  expect(runner.currentJourney.steps.length).toBe(2);
  expect(runner.currentJourney.steps).toEqual([s1, s2]);
});

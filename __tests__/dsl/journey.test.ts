import { Journey, Step } from '../../src/dsl';

const noop = async () => {};
describe('Journey', () => {
  it('add step to the journey', () => {
    const journey = new Journey({ name: 'j1' }, noop);
    journey.addStep('s1', noop);
    expect(journey.steps.length).toBe(1);
    const s2 = journey.addStep('s2', noop);
    expect(s2).toBeInstanceOf(Step);
    expect(journey.steps.length).toBe(2);
  });
});

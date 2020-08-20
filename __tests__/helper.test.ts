import { getMilliSecs, indent } from '../src/helpers';

it('get millseconds since start', () => {
  const start = process.hrtime();
  const elapsedTime = getMilliSecs(start);
  expect(elapsedTime).toBeDefined();
  expect(typeof elapsedTime).toBe('number');
});

it('indent message with seperator', () => {
  // tabWidth: 2
  const separator = ' ';
  const message = 'hello world';
  expect(indent(message, separator)).toEqual(separator + message);
});

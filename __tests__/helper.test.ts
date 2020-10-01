import { indent, getMonotonicTime, formatError } from '../src/helpers';

it('indent message with seperator', () => {
  // tabWidth: 2
  const separator = ' ';
  const message = 'hello world';
  expect(indent(message, separator)).toEqual(separator + message);
});

it('get monotonic clock time', () => {
  jest.spyOn(process, 'hrtime').mockImplementation(() => {
    return [1, 1e7];
  });
  const elapsedTime = getMonotonicTime();
  expect(elapsedTime).toBe(1.01);
});

it('format errors', () => {
  const error = new Error('testing');
  const { name, message, stack } = error;
  const formatted = formatError(error);
  expect(formatted).toStrictEqual({
    name,
    message,
    stack,
  });
});

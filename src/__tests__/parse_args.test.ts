import { parseHeadless } from '../parse_args';

describe('parse_args', () => {
  describe('parseHeadless', () => {
    it('returns false for "false"', () => {
      expect(parseHeadless('false')).toBe(false);
    });

    it('returns true for all other input', () => {
      expect(parseHeadless('unsupported')).toBe(true);
    });
  });
});

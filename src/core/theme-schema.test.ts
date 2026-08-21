import { describe, expect, it } from 'vitest';
import { xhsThemeSchema } from './theme-schema';
import { xhsThemes } from './themes';

describe('xhsThemeSchema', () => {
  it('validates every bundled theme', () => {
    for (const theme of xhsThemes) {
      expect(xhsThemeSchema.parse(theme)).toEqual(theme);
    }
  });

  it('rejects executable or malformed theme identifiers', () => {
    const invalid = {
      ...xhsThemes[0],
      id: '../run-script',
    };

    expect(() => xhsThemeSchema.parse(invalid)).toThrow();
  });
});

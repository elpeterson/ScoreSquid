import { describe, expect, it } from 'vitest';
import { formText, isRealDate, isUuid } from '@/lib/validation';

describe('validation', () => {
  it('knows a UUID', () => {
    expect(isUuid('00000000-0000-0000-0000-00000000000a')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid("1' or 1=1")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
  it('knows a real date', () => {
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2/28/2026')).toBe(false);
  });
  it('trims text, and turns anything else into nothing', () => {
    expect(formText('  x ')).toBe('x');
    expect(formText(null)).toBe('');
    expect(formText(new Blob())).toBe('');
  });
});

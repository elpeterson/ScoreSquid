import { describe, expect, it } from 'vitest';
import { chartDateFormatter } from '@/features/archery/lib/format';

describe('chartDateFormatter', () => {
  it('leaves the year off within one year', () => {
    expect(chartDateFormatter(['2025-02-22', '2025-10-19'])('2025-02-22')).toBe('Feb 22');
  });
  it("adds the year when the dates span more than one", () => {
    const format = chartDateFormatter(['2024-10-19', null, '2025-02-22']);
    expect(format('2024-10-19')).toBe("Oct 19 '24");
    expect(format('2025-02-22')).toBe("Feb 22 '25");
  });
});

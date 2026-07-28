import { describe, expect, it } from 'vitest';
import {
  currentPeriod,
  formatGrade,
  formatPercent,
  initials,
  recentPeriods,
} from '@/shared/lib/format';

describe('formatGrade', () => {
  it('always shows two decimals on the 0.0-5.0 scale', () => {
    expect(formatGrade(3)).toBe('3.00');
    expect(formatGrade(4.567)).toBe('4.57');
  });

  it('renders a dash instead of a misleading 0.00 when there is no grade', () => {
    expect(formatGrade(null)).toBe('—');
    expect(formatGrade(undefined)).toBe('—');
    expect(formatGrade(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('rounds to whole percentage points by default', () => {
    expect(formatPercent(87.4)).toBe('87%');
    expect(formatPercent(87.4, 1)).toBe('87.4%');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two names', () => {
    expect(initials('Ana María Rodríguez')).toBe('AM');
  });

  it('falls back to two letters for a single name', () => {
    expect(initials('Ana')).toBe('AN');
  });

  it('never throws on empty input', () => {
    expect(initials('   ')).toBe('?');
  });
});

/**
 * Dates are built with the local-time constructor on purpose.
 *
 * `new Date('2026-07-01')` is parsed as UTC midnight, which in Colombia
 * (UTC-5) is still 30 June locally - the boundary case these tests exist to
 * pin down. The academic period follows the teacher's local calendar.
 */
const localDate = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day);

describe('currentPeriod', () => {
  it('uses period 1 up to June and period 2 from July', () => {
    expect(currentPeriod(localDate(2026, 2, 15))).toBe('2026-1');
    expect(currentPeriod(localDate(2026, 5, 30))).toBe('2026-1');
    expect(currentPeriod(localDate(2026, 6, 1))).toBe('2026-2');
    expect(currentPeriod(localDate(2026, 11, 31))).toBe('2026-2');
  });
});

describe('recentPeriods', () => {
  it('walks backwards through halves, crossing the year boundary', () => {
    expect(recentPeriods(4, localDate(2026, 2, 15))).toEqual([
      '2026-1',
      '2025-2',
      '2025-1',
      '2024-2',
    ]);
  });

  it('starts from the second half when the date is after June', () => {
    expect(recentPeriods(3, localDate(2026, 8, 1))).toEqual(['2026-2', '2026-1', '2025-2']);
  });
});

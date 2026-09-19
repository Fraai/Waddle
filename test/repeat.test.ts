import { describe, expect, it } from 'vitest';
import { isValidRepeatRule, nextDueDate, repeatRuleLabel } from '../src/lib/repeat';

describe('isValidRepeatRule', () => {
  it('accepts the fixed rules and a valid custom interval', () => {
    expect(isValidRepeatRule('daily')).toBe(true);
    expect(isValidRepeatRule('weekly')).toBe(true);
    expect(isValidRepeatRule('monthly')).toBe(true);
    expect(isValidRepeatRule('every:3:days')).toBe(true);
    expect(isValidRepeatRule('every:1:days')).toBe(true);
  });

  it('rejects garbage and a zero/negative custom interval', () => {
    expect(isValidRepeatRule('yearly')).toBe(false);
    expect(isValidRepeatRule('every:0:days')).toBe(false);
    expect(isValidRepeatRule('every:-1:days')).toBe(false);
    expect(isValidRepeatRule('every:abc:days')).toBe(false);
    expect(isValidRepeatRule('')).toBe(false);
  });
});

describe('repeatRuleLabel', () => {
  it('labels each rule', () => {
    expect(repeatRuleLabel('daily')).toBe('Daily');
    expect(repeatRuleLabel('weekly')).toBe('Weekly');
    expect(repeatRuleLabel('monthly')).toBe('Monthly');
    expect(repeatRuleLabel('every:5:days')).toBe('Every 5 days');
  });
});

describe('nextDueDate', () => {
  it('rolls forward by the fixed intervals', () => {
    expect(nextDueDate('2026-03-10', 'daily')).toBe('2026-03-11');
    expect(nextDueDate('2026-03-10', 'weekly')).toBe('2026-03-17');
    expect(nextDueDate('2026-03-10', 'every:3:days')).toBe('2026-03-13');
  });

  it('rolls monthly forward on a normal day', () => {
    expect(nextDueDate('2026-03-10', 'monthly')).toBe('2026-04-10');
  });

  it('clamps monthly to the target month\'s last day instead of overflowing', () => {
    // Jan 31 + 1 month would naively become "Feb 31" -> Mar 3; should clamp
    // to Feb 28 (2026 is not a leap year).
    expect(nextDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('clamps monthly correctly across a leap year', () => {
    expect(nextDueDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });

  it('rolls a daily task over a year boundary', () => {
    expect(nextDueDate('2026-12-31', 'daily')).toBe('2027-01-01');
  });
});

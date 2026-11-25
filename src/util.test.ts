import { describe, expect, it } from 'vitest';
import { groupDigits, parseNum } from './util';

describe('groupDigits', () => {
  it('adds a comma every three digits', () => {
    expect(groupDigits('1000000')).toBe('1,000,000');
    expect(groupDigits('48500')).toBe('48,500');
    expect(groupDigits('999')).toBe('999');
    expect(groupDigits('')).toBe('');
  });

  it('regroups after an edit in the middle', () => {
    expect(groupDigits('1,0000,000')).toBe('10,000,000');
    expect(groupDigits('1,00,000')).toBe('100,000');
  });

  it('keeps the decimal part as typed, including a trailing dot', () => {
    expect(groupDigits('3000.')).toBe('3,000.');
    expect(groupDigits('1234.56')).toBe('1,234.56');
    expect(groupDigits('1234.5.6')).toBe('1,234.56');
  });

  it('drops the dot for whole-number fields', () => {
    expect(groupDigits('12.5', false)).toBe('125');
  });

  it('parses back to the same number', () => {
    expect(parseNum(groupDigits('1234567.89'))).toBe(1234567.89);
  });
});

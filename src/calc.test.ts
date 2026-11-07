import { describe, expect, it } from 'vitest';
import { calcPlan, compliance, makeEntries, todayState, type CalcInput } from './calc';
import type { Plan } from './types';

const base: CalcInput = {
  type: 'split',
  seed: 0,
  seedCurrency: 'USD',
  tickerCurrency: 'USD',
  fxRate: 0,
  price: 0,
  percent: 0,
  days: 0,
  sharesPerDay: 0,
};

describe('calcPlan', () => {
  it('splits total shares over days and keeps the remainder apart (memo example: 32 → 6/day + 2)', () => {
    // 20% of $16,000 = $3,200 at $100 → 32 shares over 5 days
    const r = calcPlan({ ...base, seed: 16000, price: 100, percent: 20, days: 5 });
    expect(r).toMatchObject({ amount: 3200, totalQty: 32, dailyQty: 6, remainder: 2, problem: null });
  });

  it('floors to whole shares and tolerates float error', () => {
    // 15% of 1000 = 150.00000000000003 at 50 → exactly 3 shares, not 2
    const r = calcPlan({ ...base, seed: 1000, price: 50, percent: 15, days: 1 });
    expect(r.totalQty).toBe(3);
    expect(r.dailyQty).toBe(3);
  });

  it('converts KRW seed to a USD ticker with the exchange rate', () => {
    // 5% of 14,000,000원 = 700,000원 / 1400 = $500 at $90 → 5 shares
    const r = calcPlan({ ...base, seed: 14_000_000, seedCurrency: 'KRW', fxRate: 1400, price: 90, percent: 5, days: 1 });
    expect(r.amount).toBeCloseTo(500);
    expect(r.totalQty).toBe(5);
  });

  it('needs an exchange rate when currencies differ', () => {
    const r = calcPlan({ ...base, seed: 1_000_000, seedCurrency: 'KRW', price: 90, percent: 5, days: 1 });
    expect(r.problem).toBe('환율을 입력하세요.');
  });

  it('flags a plan whose daily quantity rounds down to 0', () => {
    const r = calcPlan({ ...base, seed: 2000, price: 100, percent: 15, days: 5 });
    expect(r.totalQty).toBe(3);
    expect(r.dailyQty).toBe(0);
    expect(r.problem).toContain('하루 0주');
  });

  it('signal rules buy percent per occurrence', () => {
    const r = calcPlan({ ...base, type: 'signal', seed: 10000, price: 60, percent: 2 });
    expect(r).toMatchObject({ totalQty: 3, dailyQty: 3, problem: null });
  });

  it('fixed rules ignore the seed', () => {
    const r = calcPlan({ ...base, type: 'fixed', sharesPerDay: 1 });
    expect(r).toMatchObject({ dailyQty: 1, problem: null });
  });
});

function plan(over: Partial<Plan>): Plan {
  return {
    id: 'p',
    tickerId: 't',
    ruleId: 'r',
    ruleName: 'r',
    ruleType: 'split',
    percent: 20,
    days: 3,
    seed: 0,
    seedCurrency: 'USD',
    fxRate: 1,
    price: 0,
    amount: 0,
    totalQty: 6,
    dailyQty: 2,
    remainder: 0,
    remainderDone: false,
    entries: makeEntries('split', 3, 2),
    status: 'active',
    createdAt: '',
    endedAt: null,
    ...over,
  };
}

describe('todayState', () => {
  it('shows the next unchecked round, one per day', () => {
    const p = plan({});
    p.entries[0] = { ...p.entries[0], date: '2026-11-06', actualQty: 2 };
    const st = todayState(p, '2026-11-08');
    expect(st.kind).toBe('todo');
    expect(st.kind === 'todo' && st.entry?.n).toBe(2);
  });

  it('shows done once today is checked', () => {
    const p = plan({});
    p.entries[0] = { ...p.entries[0], date: '2026-11-08', actualQty: 2 };
    expect(todayState(p, '2026-11-08').kind).toBe('done');
  });

  it('signal plans are always available until checked today', () => {
    const p = plan({ ruleType: 'signal', entries: [], dailyQty: 3 });
    expect(todayState(p, '2026-11-08')).toEqual({ kind: 'todo', entry: null, qty: 3 });
  });
});

describe('compliance', () => {
  it('counts rounds bought as planned against all buys, including off-rule ones', () => {
    const p = plan({});
    p.entries[0] = { ...p.entries[0], date: 'a', actualQty: 2 };
    p.entries[1] = { ...p.entries[1], date: 'b', actualQty: 4 };
    const c = compliance([p], 1);
    expect(c).toEqual({ rate: 1 / 3, asPlanned: 1, total: 3 });
  });

  it('is null with nothing bought', () => {
    expect(compliance([], 0).rate).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { initialState } from './defaults';
import { trades, weights } from './portfolio';
import type { AppState, Plan } from './types';
import { tradeDay } from './util';

function state(): AppState {
  const s = initialState();
  const plan = (id: string, tickerId: string, entries: Plan['entries']): Plan => ({
    id,
    tickerId,
    ruleId: 'r',
    ruleName: '100-day MA touch',
    ruleType: 'split',
    sizing: 'amount',
    percent: 20,
    days: 5,
    seed: 0,
    seedCurrency: 'USD',
    fxRate: 1,
    price: 0,
    amount: 0,
    totalQty: 0,
    dailyQty: 0,
    remainder: 0,
    remainderDone: false,
    entries,
    status: 'active',
    createdAt: '',
    endedAt: null,
  });
  return {
    ...s,
    plans: [
      plan('a', 't-qld', [{ n: 1, plannedQty: 2, date: '2026-11-24', actualQty: 2, price: 100, cost: 200, checkedAt: '2026-11-24T19:00:00Z' }]),
      plan('b', 't-tiger-qld', [{ n: 1, plannedQty: 3, date: '2026-11-24', actualQty: 3, price: 100_000, cost: 300_000, checkedAt: '2026-11-24T01:00:00Z' }]),
    ],
    logs: [
      // 예전 형식의 규칙 외 매수 (종목·수량·가격을 글에서 읽는다)
      { id: 'l1', at: '2026-11-20T15:00:00Z', kind: 'off-rule', planId: null, label: 'QLD', detail: '1 share @ $100.00', reason: '...........' },
    ],
    fx: { usdKrw: 1400, updatedAt: '2026-11-24T00:00:00Z' },
  };
}

describe('trade day', () => {
  it('US trades use the New York date, KR trades the Seoul date', () => {
    // KST Nov 24 23:00 = UTC 14:00 → New York Nov 24
    expect(tradeDay('US', new Date('2026-11-24T14:00:00Z'))).toBe('2026-11-24');
    // KST Nov 25 04:00 (after-hours) = UTC Nov 24 19:00 → still New York Nov 24
    expect(tradeDay('US', new Date('2026-11-24T19:00:00Z'))).toBe('2026-11-24');
    // the same moment is already Nov 25 in Seoul
    expect(tradeDay('KR', new Date('2026-11-24T19:00:00Z'))).toBe('2026-11-25');
  });
});

describe('portfolio', () => {
  it('lists plan buys and unplanned buys, newest first', () => {
    const list = trades(state());
    expect(list.map((t) => [t.symbol, t.qty, t.source])).toEqual([
      ['QLD', 2, 'plan'],
      ['TIGER 나스닥100레버리지', 3, 'plan'],
      ['QLD', 1, 'unplanned'],
    ]);
  });

  it('adds ISA (₩) and Overseas ($) together in won', () => {
    const w = weights(state());
    // QLD: (200 + 100) × 1,400 = ₩420,000, TIGER: ₩300,000
    expect(w.amount?.map((x) => [x.symbol, x.value])).toEqual([
      ['QLD', 420_000],
      ['TIGER 나스닥100레버리지', 300_000],
    ]);
    expect(w.shares.map((x) => [x.symbol, x.value])).toEqual([
      ['QLD', 3],
      ['TIGER 나스닥100레버리지', 3],
    ]);
  });

  it('needs the exchange rate for amounts, not for shares', () => {
    const s = { ...state(), fx: { usdKrw: null, updatedAt: null } };
    const w = weights(s);
    expect(w.amount).toBeNull();
    expect(w.shares.length).toBe(2);
  });

  it('keeps each ticker on its color however the ranking changes', () => {
    const w = weights(state());
    // QLD is first in the ticker list, TIGER third → colors 0 and 1 by list order
    expect(w.amount?.map((x) => x.color)).toEqual([0, 1]);
  });
});

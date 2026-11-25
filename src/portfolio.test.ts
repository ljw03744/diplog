import { describe, expect, it } from 'vitest';
import { initialState } from './defaults';
import { trades, weights } from './portfolio';
import type { AppState, Plan } from './types';
import { fmtTradeTime, tradeDay, usWeekendNow } from './util';

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

// 시각은 모두 UTC로 적고, 주석에 한국 시간(KST)과 뉴욕 시간(NY)을 단다. 2026-11-27은 금요일
const at = (iso: string) => new Date(iso);

describe('trade day', () => {
  it('KR uses the Seoul date', () => {
    expect(tradeDay('KR', at('2026-11-24T19:00:00Z'))).toBe('2026-11-25'); // KST 25 04:00
  });

  it('US: pre-market, regular and after-hours are one US day', () => {
    expect(tradeDay('US', at('2026-11-27T09:00:00Z'))).toBe('2026-11-27'); // KST Fri 18:00 · NY Fri 04:00 pre-market opens
    expect(tradeDay('US', at('2026-11-27T14:40:00Z'))).toBe('2026-11-27'); // KST Fri 23:40 · regular
    expect(tradeDay('US', at('2026-11-27T20:00:00Z'))).toBe('2026-11-27'); // KST Sat 05:00 · NY Fri 15:00 regular
    expect(tradeDay('US', at('2026-11-28T00:30:00Z'))).toBe('2026-11-27'); // KST Sat 09:30 · NY Fri 19:30 after-hours
  });

  it('US: daytime trading counts for the previous US trading day', () => {
    expect(tradeDay('US', at('2026-12-01T06:00:00Z'))).toBe('2026-11-30'); // KST Tue 15:00 · NY Tue 01:00 → Mon
    expect(tradeDay('US', at('2026-11-30T02:00:00Z'))).toBe('2026-11-27'); // KST Mon 11:00 · NY Sun 21:00 → Fri
    expect(tradeDay('US', at('2026-11-30T09:00:00Z'))).toBe('2026-11-30'); // KST Mon 18:00 · NY Mon 04:00 → Mon starts
  });

  it('US: summer time moves the start to 17:00 KST by itself', () => {
    expect(tradeDay('US', at('2026-07-14T07:59:00Z'))).toBe('2026-07-13'); // KST Jul 14 16:59 · NY 03:59
    expect(tradeDay('US', at('2026-07-14T08:00:00Z'))).toBe('2026-07-14'); // KST Jul 14 17:00 · NY 04:00
  });

  it('US weekend runs from Friday 20:00 to Sunday 20:00 New York time', () => {
    expect(usWeekendNow(at('2026-11-28T00:59:00Z'))).toBe(false); // NY Fri 19:59
    expect(usWeekendNow(at('2026-11-28T01:00:00Z'))).toBe(true); // NY Fri 20:00
    expect(usWeekendNow(at('2026-11-30T00:59:00Z'))).toBe(true); // NY Sun 19:59
    expect(usWeekendNow(at('2026-11-30T01:00:00Z'))).toBe(false); // NY Sun 20:00 · daytime trading
  });
});

describe('fmtTradeTime', () => {
  it('trade date and weekday, then the plain KST clock', () => {
    expect(fmtTradeTime('2026-11-27T14:40:00Z', '2026-11-27')).toBe('Fri, Nov 27, 2026 · 23:40 KST'); // KST Fri 23:40
    expect(fmtTradeTime('2026-11-25T00:30:00Z', '2026-11-25')).toBe('Wed, Nov 25, 2026 · 09:30 KST'); // ISA
  });

  it('adds the KST date when it differs from the trade date', () => {
    expect(fmtTradeTime('2026-11-27T20:00:00Z', '2026-11-27')).toBe('Fri, Nov 27, 2026 · Nov 28 05:00 KST'); // KST Sat 05:00
    expect(fmtTradeTime('2026-11-30T02:00:00Z', '2026-11-27')).toBe('Fri, Nov 27, 2026 · Nov 30 11:00 KST'); // KST Mon 11:00 daytime
  });

  it('a US buy at 17:00 KST', () => {
    const show = (iso: string) => fmtTradeTime(iso, tradeDay('US', at(iso)));
    // 지금 (서머타임 아님): 뉴욕 03:00, 프리마켓 전 주간거래 → 직전 거래일
    expect(show('2026-11-25T08:00:00Z')).toBe('Tue, Nov 24, 2026 · Nov 25 17:00 KST'); // KST Wed 17:00
    expect(show('2026-11-30T08:00:00Z')).toBe('Fri, Nov 27, 2026 · Nov 30 17:00 KST'); // KST Mon 17:00
    // 서머타임: 뉴욕 04:00, 프리마켓 개장 → 그날
    expect(show('2026-07-15T08:00:00Z')).toBe('Wed, Jul 15, 2026 · 17:00 KST');
  });
});

describe('US holidays', () => {
  it('a marked holiday is skipped to the trading day before it', () => {
    // 추수감사절 Thu Nov 26 휴장. 한국 금 11:00 주간거래 = 뉴욕 목 21:00 → 수요일
    expect(tradeDay('US', at('2026-11-27T02:00:00Z'), ['2026-11-26'])).toBe('2026-11-25');
    // 표시하지 않았으면 목요일 그대로
    expect(tradeDay('US', at('2026-11-27T02:00:00Z'))).toBe('2026-11-26');
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

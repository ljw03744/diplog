import { describe, expect, it } from 'vitest';
import {
  calcBudget,
  calcBuy,
  calcPlan,
  compliance,
  costInAccount,
  isClosed,
  isWeekend,
  makeEntries,
  marketOf,
  roundAmount,
  roundBudget,
  ruleApplies,
  spentOf,
  todayState,
  type CalcInput,
} from './calc';
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
    expect(r.problem).toBe('Enter the exchange rate.');
  });

  it('flags a plan whose daily quantity rounds down to 0', () => {
    const r = calcPlan({ ...base, seed: 2000, price: 100, percent: 15, days: 5 });
    expect(r.totalQty).toBe(3);
    expect(r.dailyQty).toBe(0);
    expect(r.problem).toContain('0 a day');
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

describe('₩1,000,000 cash, each case on its own', () => {
  const day = (percent: number, days: number) =>
    calcBudget({ type: 'split', seed: 1_000_000, seedCurrency: 'KRW', tickerCurrency: 'KRW', fxRate: 0, percent, days }).perRound;

  it('MA touches: cash × % spread over the days', () => {
    expect(day(5, 1)).toBe(50_000); // 20-day
    expect(day(15, 5)).toBe(30_000); // 50-day
    expect(day(20, 5)).toBe(40_000); // 100-day
    expect(day(25, 5)).toBe(50_000); // 200-day
  });

  it('BB-dip: 3% of the cash balance at each buy, 10 buys', () => {
    const p = plan({ sizing: 'amount', ruleType: 'signal', percent: 3, amount: 30_000, entries: [] });
    let cash = 1_000_000;
    const buys: number[] = [];
    for (let k = 0; k < 10; k++) {
      const b = roundBudget(p, 'KRW', cash)!;
      buys.push(b);
      cash -= b;
    }
    expect(buys).toEqual([30_000, 29_000, 28_000, 27_000, 27_000, 26_000, 25_000, 24_000, 24_000, 23_000]);
    expect(cash).toBe(737_000);
  });

  it('BB-dip falls back to the starting amount when cash is unknown', () => {
    const p = plan({ sizing: 'amount', ruleType: 'signal', percent: 3, amount: 30_000, entries: [] });
    expect(roundBudget(p, 'KRW', null)).toBe(30_000);
  });
});

describe('roundAmount', () => {
  it('rounds won at the hundreds digit (to ₩1,000) and dollars at the first decimal (to $1)', () => {
    expect(roundAmount(37_037, 'KRW')).toBe(37_000);
    expect(roundAmount(37_500, 'KRW')).toBe(38_000);
    expect(roundAmount(99.99, 'USD')).toBe(100);
    expect(roundAmount(196.29, 'USD')).toBe(196);
  });
});

describe('markets', () => {
  it('knows weekends', () => {
    expect(isWeekend('2026-11-21')).toBe(true); // Sat
    expect(isWeekend('2026-11-22')).toBe(true); // Sun
    expect(isWeekend('2026-11-23')).toBe(false); // Mon
  });

  it('closes only the market marked as a holiday', () => {
    const closed = [{ date: '2026-11-26', market: 'US' as const }];
    expect(isClosed('US', '2026-11-26', closed)).toBe(true);
    expect(isClosed('KR', '2026-11-26', closed)).toBe(false);
    expect(isClosed('US', '2026-11-27', closed)).toBe(false);
  });

  it('won tickers trade in Korea, dollar tickers in the US', () => {
    expect(marketOf({ currency: 'KRW' })).toBe('KR');
    expect(marketOf({ currency: 'USD' })).toBe('US');
  });
});

describe('ruleApplies', () => {
  it('ETF rules cover Nasdaq and semis tickers; semis-only rules only semis', () => {
    expect(ruleApplies('ETF', '나스닥')).toBe(true);
    expect(ruleApplies('ETF', '반도체')).toBe(true);
    expect(ruleApplies('ETF', '개별')).toBe(false);
    expect(ruleApplies('반도체', '나스닥')).toBe(false);
    expect(ruleApplies('반도체', '반도체')).toBe(true);
    expect(ruleApplies('개별', '개별')).toBe(true);
  });
});

describe('calcBudget', () => {
  const b = { type: 'split' as const, seed: 1_000_000, seedCurrency: 'KRW' as const, tickerCurrency: 'KRW' as const, fxRate: 0, percent: 20, days: 5 };

  it('splits seed × percent into equal amounts per round', () => {
    expect(calcBudget(b)).toMatchObject({ amount: 200_000, perRound: 40_000, rounds: 5, problem: null });
  });

  it('signal rules spend percent of the seed each time (3% lower-BB rule)', () => {
    expect(calcBudget({ ...b, type: 'signal', percent: 3, days: 0 })).toMatchObject({ amount: 30_000, perRound: 30_000, rounds: 1 });
  });

  it('converts a won seed into dollars for a dollar ticker', () => {
    expect(calcBudget({ ...b, tickerCurrency: 'USD', fxRate: 1400, seed: 1_400_000 }).amount).toBeCloseTo(200);
  });

  it('needs a seed', () => {
    expect(calcBudget({ ...b, seed: NaN }).problem).not.toBeNull();
  });
});

describe('roundBudget', () => {
  const amountPlan = () => plan({ sizing: 'amount', amount: 300, entries: makeEntries('split', 3, 0) });

  it('is the amount ÷ rounds at the start', () => {
    expect(roundBudget(amountPlan(), 'USD')).toBe(100);
  });

  it('spreads what is left over the remaining rounds, so price moves even out', () => {
    const p = amountPlan();
    p.entries[0] = { ...p.entries[0], date: 'a', plannedQty: 3, actualQty: 3, price: 30, cost: 90 };
    expect(spentOf(p)).toBe(90);
    expect(roundBudget(p, 'USD')).toBe(105);
  });

  it('rounds to ₩1,000 for won plans', () => {
    const p = plan({ sizing: 'amount', amount: 185_185, entries: makeEntries('split', 5, 0) });
    expect(roundBudget(p, 'KRW')).toBe(37_000);
  });

  it('is null for share-based plans', () => {
    expect(roundBudget(plan({}), 'USD')).toBeNull();
  });
});

describe('calcBuy', () => {
  it("turns today's amount and price into whole shares", () => {
    expect(calcBuy({ budget: 100, fixedQty: 0, price: 30, cash: null, toCash: 1 })).toMatchObject({ qty: 3, cost: 90, capped: false, problem: null });
  });

  it('cuts the buy to what the cash can pay for', () => {
    const r = calcBuy({ budget: 100, fixedQty: 0, price: 30, cash: 70, toCash: 1 });
    expect(r).toMatchObject({ qty: 2, cost: 60, capped: true, cashAfter: 10 });
  });

  it('converts the cost into the account currency', () => {
    const r = calcBuy({ budget: 100, fixedQty: 0, price: 30, cash: 1_000_000, toCash: 1400 });
    expect(r.cashAfter).toBeCloseTo(1_000_000 - 90 * 1400);
  });

  it('uses the fixed share count for share-based plans', () => {
    expect(calcBuy({ budget: null, fixedQty: 1, price: 30, cash: null, toCash: null })).toMatchObject({ qty: 1, cost: 30 });
  });

  it('asks for a price', () => {
    expect(calcBuy({ budget: 100, fixedQty: 0, price: NaN, cash: null, toCash: 1 }).problem).not.toBeNull();
  });
});

describe('costInAccount', () => {
  it('passes through when the ticker is in the account currency', () => {
    expect(costInAccount(50, 'USD', '직투', 1)).toBe(50);
    expect(costInAccount(50_000, 'KRW', 'ISA', 1)).toBe(50_000);
  });

  it('is null when the rate is unknown', () => {
    expect(costInAccount(50, 'USD', 'ISA', 1)).toBeNull();
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

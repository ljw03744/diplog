import { describe, expect, it } from 'vitest';
import { initialState, migrateToEnglish } from './defaults';
import { buildReview, reviewStats } from './review';
import type { AppState, LogItem, Plan } from './types';

const NOW = new Date('2026-11-08T12:00:00');

function log(at: string, kind: LogItem['kind'], reason: string, label = 'QLD'): LogItem {
  return { id: at + kind, at, kind, planId: null, label, detail: '3주', reason };
}

function plan(entries: Plan['entries']): Plan {
  return {
    id: 'p1',
    tickerId: 't1',
    ruleId: 'r1',
    ruleName: '100-day MA touch',
    ruleType: 'split',
    percent: 20,
    days: 5,
    seed: 1000,
    seedCurrency: 'USD',
    fxRate: 1,
    price: 10,
    amount: 200,
    totalQty: 20,
    dailyQty: 4,
    remainder: 0,
    remainderDone: false,
    entries,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    endedAt: null,
  };
}

function state(): AppState {
  const s = initialState();
  s.plans = [
    plan([
      { n: 1, plannedQty: 4, date: '2026-03-01', actualQty: 4 }, // 90일 밖
      { n: 2, plannedQty: 4, date: '2026-11-01', actualQty: 4 },
      { n: 3, plannedQty: 4, date: '2026-11-02', actualQty: 2 },
      { n: 4, plannedQty: 4, date: null, actualQty: null },
    ]),
  ];
  s.logs = [
    log('2026-11-05T05:00:00Z', 'off-rule', '실적 발표 전에\n오를 것 같아서', 'NVDA'),
    log('2026-11-02T05:00:00Z', 'qty-diff', '환율이 올라서 줄였다'),
    log('2026-02-01T05:00:00Z', 'off-rule', '오래된 충동 매수', 'TSLA'),
  ];
  return s;
}

describe('reviewStats', () => {
  it('limits fills and logs to the last 90 days', () => {
    const st = reviewStats(state(), 90, NOW);
    expect(st.offRule.map((l) => l.label)).toEqual(['NVDA']);
    expect(st.others).toHaveLength(1);
    // 기간 안 체결 2회 (1회 계획대로) + 규칙 외 매수 1건
    expect(st).toMatchObject({ asPlanned: 1, total: 3 });
  });

  it('uses everything for the whole range', () => {
    const st = reviewStats(state(), 'all', NOW);
    expect(st.offRule).toHaveLength(2);
    expect(st).toMatchObject({ asPlanned: 2, total: 5 });
  });
});

describe('buildReview', () => {
  it('includes the request, rules, stats and every reason on one line', () => {
    const md = buildReview(state(), 90, NOW);
    expect(md).toContain('# DipLog trade review request');
    expect(md).toContain("Don't give investment advice");
    expect(md).toContain('Rule adherence: 33%');
    expect(md).toContain('[Nasdaq] 100-day MA touch: split, 20% of seed spread over 5 days');
    expect(md).toContain('- Reason: 실적 발표 전에 / 오를 것 같아서');
    expect(md).toContain('Different amount · QLD');
    expect(md).not.toContain('TSLA');
  });

  it('says so when there is nothing in range', () => {
    const s = state();
    s.logs = [];
    s.plans = [];
    const md = buildReview(s, 90, NOW);
    expect(md).toContain('Rule adherence: no data');
    expect(md).toContain('## Off-rule buys (0)\nNone');
  });
});

describe('migrateToEnglish', () => {
  it('renames untouched Korean defaults and leaves user text and logs alone', () => {
    const s = state();
    s.rules = [
      { ...s.rules[0], name: '100일선 터치', note: '' },
      { ...s.rules[1], name: '내가 만든 규칙', note: '내 메모' },
    ];
    s.plans[0].ruleName = '100일선 터치';
    s.commonChecks = ['주가가 하락 추세다.', '내가 쓴 체크'];
    s.tickers = [{ ...s.tickers[0], name: '나스닥100 2배' }];
    const m = migrateToEnglish(s);
    expect(m.rules.map((r) => r.name)).toEqual(['100-day MA touch', '내가 만든 규칙']);
    expect(m.rules[1].note).toBe('내 메모');
    expect(m.plans[0].ruleName).toBe('100-day MA touch');
    expect(m.commonChecks).toEqual(['The price is in a downtrend.', '내가 쓴 체크']);
    expect(m.tickers[0].name).toBe('Nasdaq-100 2x');
    expect(m.logs).toEqual(s.logs);
  });
});

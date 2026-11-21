import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, initialState, migrateRules, RULES_REV } from './defaults';
import type { AppState, Rule } from './types';

// 예전 데이터에는 지금 타입에 없는 '나스닥' 그룹 값이 들어 있다
type OldGroup = Rule['group'] | '나스닥';
const rule = (id: string, group: OldGroup, over: Partial<Rule> = {}): Rule =>
  ({ id, name: id, group, type: 'split', percent: 15, days: 5, sharesPerDay: 0, note: '', ...over }) as Rule;
const bb = (id: string, group: OldGroup): Rule => rule(id, group, { name: 'Lower BB after RSI<30', type: 'signal', percent: 2, days: 0, note: 'old note' });

/** rev 1 시절 데이터: 나스닥·반도체 규칙이 따로, 하루 1주 공통 규칙, 2% 볼밴 */
function oldState(): AppState {
  const s = initialState();
  return {
    ...s,
    rules: [
      rule('ndx-2', '나스닥'),
      bb('ndx-bb', '나스닥'),
      rule('semi-2', '반도체'),
      rule('semi-3', '반도체', { percent: 30 }), // 사용자가 바꾼 반도체 규칙
      bb('semi-bb', '반도체'),
      rule('semi-200w', '반도체', { percent: 70, days: 1 }),
      { id: 'common-bb-1', name: 'Below 200-day · lower BB · 1 share', group: '공통', type: 'fixed', percent: 0, days: 0, sharesPerDay: 1, note: '' },
      rule('mine', '개별', { type: 'signal', percent: 2, days: 0 }),
    ],
    settings: { ...s.settings, rulesRev: 1 },
  };
}

describe('default rules', () => {
  it('are ETF + semis-only 200-week + individual stocks, with a 3% lower-BB rule and no 1-share rule', () => {
    expect([...new Set(DEFAULT_RULES.map((r) => r.group))]).toEqual(['ETF', '반도체', '개별']);
    expect(DEFAULT_RULES.filter((r) => r.group === '반도체').map((r) => r.id)).toEqual(['semi-200w']);
    const bbRules = DEFAULT_RULES.filter((r) => r.type === 'signal');
    expect(bbRules.map((r) => [r.group, r.percent])).toEqual([['ETF', 3]]);
    expect(DEFAULT_RULES.some((r) => r.type === 'fixed')).toBe(false);
  });
});

describe('BB-dip', () => {
  it('is the default name for the 3% lower-band rule', () => {
    expect(DEFAULT_RULES.find((r) => r.type === 'signal')?.name).toBe('BB-dip');
  });

  it('old data is renamed once, plans too, and it is logged', () => {
    const s0 = oldState();
    s0.plans = [{ ruleType: 'signal', ruleName: 'Lower BB after RSI<30' } as AppState['plans'][number]];
    const s = migrateRules(s0, 3);
    expect(s.rules.find((r) => r.id === 'ndx-bb')?.name).toBe('BB-dip');
    expect(s.rules.find((r) => r.id === 'ndx-bb')?.note).toMatch(/3% of your cash balance at that moment/);
    expect(s.plans[0].ruleName).toBe('BB-dip');
    expect(s.logs.some((l) => l.detail.includes('→ BB-dip'))).toBe(true);
  });
});

describe('migrateRules', () => {
  it('from rev 1: 3% lower BB, no 1-share rule, Nasdaq → ETF, duplicate semis rules removed', () => {
    const s = migrateRules(oldState(), 1);
    const byId = (id: string) => s.rules.find((r) => r.id === id);
    expect(byId('ndx-bb')).toMatchObject({ group: 'ETF', percent: 3 });
    expect(byId('ndx-2')?.group).toBe('ETF');
    expect(byId('ndx-2')?.note).toMatch(/Semis: only after/);
    expect(byId('semi-2')).toBeUndefined();
    expect(byId('semi-bb')).toBeUndefined();
    expect(byId('semi-3')).toMatchObject({ group: '반도체', percent: 30 }); // 다르게 바꾼 건 '반도체만'으로 남김
    expect(byId('semi-200w')?.group).toBe('반도체');
    expect(byId('common-bb-1')).toBeUndefined();
    expect(byId('mine')?.percent).toBe(2);
    expect(s.logs.every((l) => l.reason.length >= 10)).toBe(true);
    expect(s.logs.some((l) => l.label === 'Rule groups')).toBe(true);
    expect(s.settings.rulesRev).toBe(RULES_REV);
  });

  it('from rev 2: merges groups and renames to BB-dip, keeps the %', () => {
    const s = migrateRules({ ...oldState(), logs: [] }, 2);
    expect(s.rules.find((r) => r.id === 'ndx-bb')?.percent).toBe(2);
    expect(s.logs.map((l) => l.label).sort()).toEqual(['Rule groups', '[ETF] BB-dip']);
  });

  it('runs only once', () => {
    const once = migrateRules(oldState(), 1);
    expect(migrateRules(once, once.settings.rulesRev)).toBe(once);
  });

  it('leaves a lower-BB rule the user already changed', () => {
    const s = oldState();
    s.rules[1] = { ...s.rules[1], percent: 4 };
    expect(migrateRules(s, 1).rules.find((r) => r.id === 'ndx-bb')?.percent).toBe(4);
  });
});

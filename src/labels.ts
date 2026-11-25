// Display names for values that are stored in Korean.
// The stored values stay as they are so existing data and backups keep working.
import type { Account, Market, RuleGroup, TickerGroup } from './types';

/** 종목 그룹 */
export const GROUP_LABEL: Record<TickerGroup, string> = {
  나스닥: 'Nasdaq',
  반도체: 'Semis',
  개별: 'Individual stocks',
  채권: 'Bonds',
};

/** 규칙 그룹. '나스닥'은 예전 기록에 남아 있는 값 */
export const RULE_GROUP_LABEL: Record<RuleGroup | '나스닥', string> = {
  ETF: 'ETF',
  반도체: 'Semis only',
  개별: 'Individual stocks',
  공통: 'All tickers',
  나스닥: 'Nasdaq',
};

export const ACCOUNT_LABEL: Record<Account, string> = {
  직투: 'US',
  ISA: 'ISA',
};

export const MARKET_LABEL: Record<Market, string> = {
  KR: 'Korea',
  US: 'US',
};

export function groupLabel(g: string): string {
  return GROUP_LABEL[g as TickerGroup] ?? g;
}

export function ruleGroupLabel(g: string): string {
  return RULE_GROUP_LABEL[g as RuleGroup] ?? groupLabel(g);
}

export function accountLabel(a: string): string {
  return ACCOUNT_LABEL[a as Account] ?? a;
}

/** "3 shares", "1 share" */
export function shares(n: number): string {
  return `${n} ${n === 1 ? 'share' : 'shares'}`;
}

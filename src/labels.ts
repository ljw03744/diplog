// Display names for values that are stored in Korean.
// The stored values stay as they are so existing data and backups keep working.
import type { Account, RuleGroup } from './types';

export const GROUP_LABEL: Record<RuleGroup, string> = {
  나스닥: 'Nasdaq',
  반도체: 'Semis',
  개별: 'Stocks',
  채권: 'Bonds',
  공통: 'Common',
};

export const ACCOUNT_LABEL: Record<Account, string> = {
  직투: 'Direct',
  ISA: 'ISA',
};

export function groupLabel(g: string): string {
  return GROUP_LABEL[g as RuleGroup] ?? g;
}

export function accountLabel(a: string): string {
  return ACCOUNT_LABEL[a as Account] ?? a;
}

/** "3 shares", "1 share" */
export function shares(n: number): string {
  return `${n} ${n === 1 ? 'share' : 'shares'}`;
}

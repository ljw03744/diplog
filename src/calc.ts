import type { Currency, Entry, Plan, RuleType } from './types';

export interface CalcInput {
  type: RuleType;
  seed: number;
  seedCurrency: Currency;
  tickerCurrency: Currency;
  /** 1달러 = fxRate 원. 통화가 같으면 무시 */
  fxRate: number;
  price: number;
  percent: number;
  days: number;
  sharesPerDay: number;
}

export interface CalcResult {
  /** 종목 통화 기준 쓰는 금액 (fixed는 수량 × 가격) */
  amount: number;
  totalQty: number;
  /** split: 하루 수량, signal/fixed: 한 번에 사는 수량 */
  dailyQty: number;
  remainder: number;
  /** 살 수 없는 이유. 없으면 null */
  problem: string | null;
}

const EPS = 1e-9;

export function convert(v: number, from: Currency, to: Currency, fxRate: number): number {
  if (from === to) return v;
  return from === 'USD' ? v * fxRate : v / fxRate;
}

export function calcPlan(i: CalcInput): CalcResult {
  if (i.type === 'fixed') {
    const qty = Math.max(0, Math.floor(i.sharesPerDay));
    return {
      amount: i.price > 0 ? qty * i.price : 0,
      totalQty: qty,
      dailyQty: qty,
      remainder: 0,
      problem: qty > 0 ? null : 'Shares per day is 0.',
    };
  }

  const empty = (problem: string): CalcResult => ({ amount: 0, totalQty: 0, dailyQty: 0, remainder: 0, problem });
  if (!(i.seed > 0)) return empty('Enter your seed.');
  if (!(i.price > 0)) return empty('Enter the current price.');
  if (i.seedCurrency !== i.tickerCurrency && !(i.fxRate > 0)) return empty('Enter the exchange rate.');

  const amount = convert((i.seed * i.percent) / 100, i.seedCurrency, i.tickerCurrency, i.fxRate);
  const totalQty = Math.floor(amount / i.price + EPS);

  if (i.type === 'signal') {
    return {
      amount,
      totalQty,
      dailyQty: totalQty,
      remainder: 0,
      problem: totalQty > 0 ? null : "You can't buy even 1 share per signal. The price is too high for your seed.",
    };
  }

  const days = Math.max(1, Math.floor(i.days));
  const dailyQty = Math.floor(totalQty / days);
  const remainder = totalQty - dailyQty * days;
  let problem: string | null = null;
  if (totalQty === 0) problem = "You can't buy even 1 share. The price is too high for your seed.";
  else if (dailyQty === 0) problem = `${totalQty} shares in total is 0 a day over ${days} days.`;
  return { amount, totalQty, dailyQty, remainder, problem };
}

export function makeEntries(type: RuleType, days: number, dailyQty: number): Entry[] {
  if (type !== 'split') return [];
  return Array.from({ length: Math.max(1, days) }, (_, k) => ({
    n: k + 1,
    plannedQty: dailyQty,
    date: null,
    actualQty: null,
  }));
}

export type TodayState =
  /** 오늘 할 회차가 있음 */
  | { kind: 'todo'; entry: Entry | null; qty: number }
  /** 오늘 이미 체크함 */
  | { kind: 'done'; entry: Entry }
  /** 끝난 일정 */
  | { kind: 'none' };

/**
 * 하루에 한 회차씩. 휴장일이나 빠진 날은 다음 날로 자연스럽게 밀린다.
 * split: 오늘 체크한 회차가 없으면 다음 회차가 오늘 할 일.
 * signal/fixed: 오늘 체크한 기록이 없으면 '조건 충족 시 매수'가 오늘 할 일.
 */
export function todayState(plan: Plan, today: string): TodayState {
  if (plan.status !== 'active') return { kind: 'none' };
  const doneToday = plan.entries.find((e) => e.date === today);
  if (doneToday) return { kind: 'done', entry: doneToday };
  if (plan.ruleType === 'split') {
    const next = plan.entries.find((e) => e.actualQty === null);
    return next ? { kind: 'todo', entry: next, qty: next.plannedQty } : { kind: 'none' };
  }
  return { kind: 'todo', entry: null, qty: plan.dailyQty };
}

export function boughtQty(plan: Plan): number {
  return plan.entries.reduce((s, e) => s + (e.actualQty ?? 0), 0) + (plan.remainderDone ? plan.remainder : 0);
}

export function progress(plan: Plan): { done: number; total: number | null } {
  const done = plan.entries.filter((e) => e.actualQty !== null).length;
  return { done, total: plan.ruleType === 'split' ? plan.entries.length : null };
}

/**
 * 준수율 = 계획대로 체결한 회차 / 체결한 전체 회차.
 * 규칙 외 매수도 '규칙대로 하지 않은 매수'로 분모에 포함.
 */
export function compliance(plans: Plan[], offRuleCount: number): { rate: number | null; asPlanned: number; total: number } {
  let asPlanned = 0;
  let total = 0;
  for (const p of plans)
    for (const e of p.entries) {
      if (e.actualQty === null) continue;
      total++;
      if (e.actualQty === e.plannedQty) asPlanned++;
    }
  total += offRuleCount;
  return { rate: total === 0 ? null : asPlanned / total, asPlanned, total };
}

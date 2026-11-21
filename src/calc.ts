import type { Account, ClosedDay, Currency, Entry, Market, Plan, RuleGroup, RuleType, Ticker, TickerGroup } from './types';

/** ISA는 원화 계좌, 직투는 달러 계좌 */
export function accountCurrency(a: Account): Currency {
  return a === 'ISA' ? 'KRW' : 'USD';
}

/**
 * 종목 통화로 쓴 금액을 계좌 통화로. 통화가 다른데 환율을 모르면 null (현금에서 빼지 않음)
 */
export function costInAccount(cost: number, tickerCur: Currency, account: Account, fxRate: number): number | null {
  const to = accountCurrency(account);
  if (tickerCur === to) return cost;
  if (!(fxRate > 1)) return null;
  return convert(cost, tickerCur, to, fxRate);
}

export interface BudgetInput {
  type: 'split' | 'signal';
  seed: number;
  seedCurrency: Currency;
  tickerCurrency: Currency;
  fxRate: number;
  percent: number;
  days: number;
}

export interface BudgetResult {
  /** 종목 통화 기준 이번 일정에 쓰는 금액 (signal은 한 번에 쓰는 금액) */
  amount: number;
  /** 한 회차에 쓰는 금액 */
  perRound: number;
  rounds: number;
  problem: string | null;
}

/** 금액 기준 일정: 씨드 × 비중% 를 회차에 나눈다. 수량은 그날 가격으로 정한다 */
export function calcBudget(i: BudgetInput): BudgetResult {
  const rounds = i.type === 'split' ? Math.max(1, Math.floor(i.days)) : 1;
  const empty = (problem: string): BudgetResult => ({ amount: 0, perRound: 0, rounds, problem });
  if (!(i.seed > 0)) return empty('Enter your cash.');
  if (i.seedCurrency !== i.tickerCurrency && !(i.fxRate > 0)) return empty('Enter the exchange rate.');
  const amount = convert((i.seed * i.percent) / 100, i.seedCurrency, i.tickerCurrency, i.fxRate);
  const perRound = roundAmount(amount / rounds, i.tickerCurrency);
  return { amount, perRound, rounds, problem: perRound > 0 ? null : 'The amount is 0.' };
}

/** 하루 금액 반올림: 원화는 백의 자리에서 (천 원 단위), 달러는 소수점 첫째 자리에서 (1달러 단위) */
export function roundAmount(v: number, cur: Currency): number {
  return cur === 'KRW' ? Math.round(v / 1000) * 1000 : Math.round(v);
}

/** 이 일정에서 지금까지 쓴 금액 (종목 통화). 가격을 모르는 예전 회차는 만들 때 가격으로 */
export function spentOf(plan: Plan): number {
  return plan.entries.reduce((s, e) => {
    if (e.actualQty === null) return s;
    if (e.cost != null) return s + e.cost;
    return s + e.actualQty * (e.price ?? plan.price ?? 0);
  }, 0);
}

/**
 * 금액 기준 일정에서 오늘 회차에 쓸 금액. 수량 기준이면 null.
 * split: 시작할 때 현금 × 비중% 를 남은 금액 ÷ 남은 회차로. 가격이 움직여 덜 쓰거나 더 쓴 만큼 다음 회차가 맞춰진다.
 * signal: 살 때마다 그 순간의 현금 잔고 × 비중% (BB-dip: 100만 원 → 3만, 97만 → 2만 9천 …).
 *         cash: 계좌 현금을 종목 통화로 바꾼 값. 모르면 시작할 때 금액을 쓴다.
 */
export function roundBudget(plan: Plan, cur: Currency, cash: number | null = null): number | null {
  if (plan.sizing !== 'amount') return null;
  if (plan.ruleType !== 'split') return roundAmount(cash !== null ? (cash * plan.percent) / 100 : plan.amount, cur);
  const left = plan.entries.filter((e) => e.actualQty === null).length;
  if (left === 0) return 0;
  return roundAmount(Math.max(0, plan.amount - spentOf(plan)) / left, cur);
}

/* ───────── 장 / 규칙 그룹 ───────── */

/** 원화 종목은 국장, 달러 종목은 미장 */
export function marketOf(t: Pick<Ticker, 'currency'> | undefined): Market {
  return t?.currency === 'KRW' ? 'KR' : 'US';
}

/** YYYY-MM-DD가 토·일인지 */
export function isWeekend(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

/** 오늘 그 장이 쉬는지. 주말이거나 사용자가 휴장일로 표시했으면 쉰다 */
export function isClosed(market: Market, today: string, closedDays: ClosedDay[]): boolean {
  return isWeekend(today) || closedDays.some((c) => c.date === today && c.market === market);
}

/** 이 규칙을 이 종목에 쓸 수 있는지 */
export function ruleApplies(group: RuleGroup, tickerGroup: TickerGroup): boolean {
  switch (group) {
    case 'ETF':
      return tickerGroup === '나스닥' || tickerGroup === '반도체';
    case '반도체':
      return tickerGroup === '반도체';
    case '개별':
      return tickerGroup === '개별';
    case '공통':
      return tickerGroup !== '채권';
  }
}

export interface BuyInput {
  /** 금액 기준이면 오늘 쓸 금액, 수량 기준이면 null */
  budget: number | null;
  /** 수량 기준일 때 살 수량 */
  fixedQty: number;
  price: number;
  /** 계좌 현금 (계좌 통화). 모르면 null → 현금으로 자르지 않음 */
  cash: number | null;
  /** 종목 통화 1 = 계좌 통화 몇. 같으면 1, 모르면 null */
  toCash: number | null;
}

export interface BuyResult {
  qty: number;
  /** 종목 통화 */
  cost: number;
  /** 현금이 모자라서 줄였음 */
  capped: boolean;
  /** 사고 난 뒤 계좌 현금 (계좌 통화) */
  cashAfter: number | null;
  problem: string | null;
}

/** 그날 가격으로 몇 주를 살지. 보유 현금보다 많으면 현금만큼으로 줄인다 */
export function calcBuy(i: BuyInput): BuyResult {
  if (!(i.price > 0)) return { qty: 0, cost: 0, capped: false, cashAfter: i.cash, problem: "Enter today's price." };
  let qty = i.budget !== null ? Math.floor(i.budget / i.price + EPS) : Math.max(0, Math.floor(i.fixedQty));
  let capped = false;
  if (i.cash !== null && i.toCash !== null) {
    const affordable = Math.max(0, Math.floor(i.cash / (i.price * i.toCash) + EPS));
    if (qty > affordable) {
      qty = affordable;
      capped = true;
    }
  }
  const cost = qty * i.price;
  const cashAfter = i.cash !== null && i.toCash !== null ? i.cash - cost * i.toCash : i.cash;
  let problem: string | null = null;
  if (qty === 0)
    problem = capped ? "Your cash isn't enough for even 1 share." : "Today's order amount isn't enough for 1 share at this price.";
  return { qty, cost, capped, cashAfter, problem };
}

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
  if (!(i.seed > 0)) return empty('Enter your cash.');
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
      problem: totalQty > 0 ? null : "You can't buy even 1 share per signal. The price is too high for your cash.",
    };
  }

  const days = Math.max(1, Math.floor(i.days));
  const dailyQty = Math.floor(totalQty / days);
  const remainder = totalQty - dailyQty * days;
  let problem: string | null = null;
  if (totalQty === 0) problem = "You can't buy even 1 share. The price is too high for your cash.";
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

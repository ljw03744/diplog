import { calcBudget, calcBuy, calcPlan, costInAccount, makeEntries, marketOf, roundBudget, type BuyResult } from './calc';
import { ruleGroupLabel } from './labels';
import { setState, getState } from './store';
import type { Account, AppState, Currency, LogItem, LogKind, Market, Plan, Rule, RuleGroup, Saving, Ticker } from './types';
import { fmtMoney, nowIso, tradeDay, uid } from './util';

export const MIN_REASON = 10;

function log(s: AppState, kind: LogKind, label: string, detail: string, reason: string, planId: string | null = null): AppState {
  const item: LogItem = { id: uid(), at: nowIso(), kind, planId, label, detail, reason: reason.trim() };
  return { ...s, logs: [item, ...s.logs] };
}

function updatePlan(s: AppState, id: string, f: (p: Plan) => Plan): AppState {
  return { ...s, plans: s.plans.map((p) => (p.id === id ? f(p) : p)) };
}

export function planLabel(p: Plan, s: AppState = getState()): string {
  const t = s.tickers.find((x) => x.id === p.tickerId);
  return `${t?.symbol ?? 'Deleted ticker'} · ${p.ruleName}`;
}

export interface NewPlanInput {
  ticker: Ticker;
  rule: Rule;
  seed: number;
  seedCurrency: Currency;
  fxRate: number;
  price: number;
  /** 진행 중인 일정이 있을 때 이유 */
  concurrentReason: string | null;
}

export function createPlan(i: NewPlanInput): string {
  const base = {
    id: uid(),
    tickerId: i.ticker.id,
    ruleId: i.rule.id,
    ruleName: i.rule.name,
    ruleType: i.rule.type,
    percent: i.rule.percent,
    days: i.rule.type === 'split' ? i.rule.days : 0,
    seed: i.seed,
    seedCurrency: i.seedCurrency,
    fxRate: i.seedCurrency === i.ticker.currency ? 1 : i.fxRate,
    price: i.price,
    remainderDone: false,
    status: 'active' as const,
    createdAt: nowIso(),
    endedAt: null,
  };
  let plan: Plan;
  if (i.rule.type === 'fixed') {
    const c = calcPlan({
      type: 'fixed',
      seed: 0,
      seedCurrency: i.seedCurrency,
      tickerCurrency: i.ticker.currency,
      fxRate: i.fxRate,
      price: i.price,
      percent: 0,
      days: 0,
      sharesPerDay: i.rule.sharesPerDay,
    });
    plan = { ...base, sizing: 'shares', amount: c.amount, totalQty: c.totalQty, dailyQty: c.dailyQty, remainder: 0, entries: [] };
  } else {
    // 금액 기준: 수량은 회차마다 그날 가격으로 정한다
    const b = calcBudget({
      type: i.rule.type,
      seed: i.seed,
      seedCurrency: i.seedCurrency,
      tickerCurrency: i.ticker.currency,
      fxRate: i.fxRate,
      percent: i.rule.percent,
      days: i.rule.days,
    });
    plan = {
      ...base,
      sizing: 'amount',
      amount: b.amount,
      totalQty: 0,
      dailyQty: 0,
      remainder: 0,
      entries: makeEntries(i.rule.type, i.rule.days, 0),
    };
  }
  setState((s) => {
    let next = { ...s, plans: [plan, ...s.plans] };
    if (i.concurrentReason) {
      const others = s.plans
        .filter((p) => p.status === 'active')
        .map((p) => planLabel(p, s))
        .join(', ');
      next = log(next, 'concurrent', planLabel(plan, next), `In progress: ${others}`, i.concurrentReason, plan.id);
    }
    return next;
  });
  return plan.id;
}

export interface BuyPreview extends BuyResult {
  /** 금액 기준이면 오늘 쓸 금액 (종목 통화), 수량 기준이면 null */
  budget: number | null;
  account: Account | null;
  /** 종목 통화 1 = 계좌 통화 몇. 모르면 null */
  toCash: number | null;
  /** 지금 계좌 현금. 입력한 적 없으면 null */
  cash: number | null;
}

/**
 * 오늘 쓸 금액 (종목 통화). 신호마다 규칙(BB-dip)은 지금 현금 잔고 × 비중% 라 살 때마다 줄어든다.
 * 수량 기준 일정이면 null.
 */
export function budgetFor(p: Plan, s: AppState = getState()): number | null {
  const t = s.tickers.find((x) => x.id === p.tickerId);
  const cur = t?.currency ?? 'USD';
  const cash = t ? s.cash[t.account] : null;
  const toCash = t ? costInAccount(1, t.currency, t.account, p.fxRate) : null;
  const cashInTicker = cash !== null && toCash ? cash / toCash : null;
  return roundBudget(p, cur, cashInTicker);
}

/** 오늘 가격으로 몇 주를 사야 하는지. 화면과 체크 둘 다 이 계산을 쓴다 */
export function previewBuy(p: Plan, price: number, s: AppState = getState()): BuyPreview {
  const t = s.tickers.find((x) => x.id === p.tickerId);
  const budget = budgetFor(p, s);
  const fixedQty = p.ruleType === 'split' ? (p.entries.find((e) => e.actualQty === null)?.plannedQty ?? 0) : p.dailyQty;
  const account = t?.account ?? null;
  const toCash = t ? costInAccount(1, t.currency, t.account, p.fxRate) : null;
  const cash = account ? s.cash[account] : null;
  return { ...calcBuy({ budget, fixedQty, price, cash, toCash }), budget, account, toCash, cash };
}

/**
 * 오늘 회차 체크. 그날 가격으로 계획 수량을 정하고, 산 만큼 계좌 현금에서 뺀다.
 * qty가 계획과 다르면 reason 필수.
 */
export function checkToday(planId: string, today: string, price: number, qty: number, reason: string | null): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p || p.status !== 'active' || p.entries.some((e) => e.date === today)) return s;
    const pv = previewBuy(p, price, s);
    const planned = pv.qty;
    const cost = qty * price;
    const deduct = pv.account && pv.cash !== null && pv.toCash !== null ? cost * pv.toCash : null;
    const filled = {
      date: today,
      plannedQty: planned,
      actualQty: qty,
      price,
      cost,
      cashDeducted: pv.account && deduct !== null ? { account: pv.account, amount: deduct } : null,
      checkedAt: nowIso(),
    };
    let next: AppState;
    let n: number;
    if (p.ruleType === 'split') {
      const target = p.entries.find((e) => e.actualQty === null);
      if (!target) return s;
      n = target.n;
      const entries = p.entries.map((e) => (e === target ? { ...e, ...filled } : e));
      const finished = entries.every((e) => e.actualQty !== null);
      next = updatePlan(s, planId, (p) => ({
        ...p,
        entries,
        status: finished ? 'done' : 'active',
        endedAt: finished ? nowIso() : null,
      }));
    } else {
      n = p.entries.length + 1;
      next = updatePlan(s, planId, (p) => ({ ...p, entries: [...p.entries, { n, ...filled }] }));
    }
    if (pv.account && deduct !== null && pv.cash !== null) {
      next = { ...next, cash: { ...next.cash, [pv.account]: pv.cash - deduct } };
    }
    if (planned !== qty) {
      const t = s.tickers.find((x) => x.id === p.tickerId);
      const at = ` @ ${fmtMoney(price, t?.currency ?? 'USD')}`;
      next = log(next, 'qty-diff', planLabel(p, s), `Tranche ${n}: planned ${planned}, bought ${qty}${at}`, reason ?? '', planId);
    }
    return next;
  });
}

/**
 * 오늘 체크 취소 (잘못 누른 경우). 같은 날만 가능.
 * 뺀 현금을 되돌린다. 단, 체크 뒤에 실제 잔고로 맞췄다면 그 잔고가 이미 정답이라 건드리지 않는다.
 */
export function uncheckToday(planId: string, today: string): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    const e = p?.entries.find((x) => x.date === today);
    if (!p || !e) return s;
    let next = updatePlan(s, planId, (p) => {
      if (p.ruleType === 'split') {
        const entries = p.entries.map((x) =>
          x.date === today ? { n: x.n, plannedQty: p.sizing === 'amount' ? 0 : x.plannedQty, date: null, actualQty: null } : x,
        );
        return { ...p, entries, status: 'active', endedAt: null };
      }
      return { ...p, entries: p.entries.filter((x) => x.date !== today) };
    });
    const d = e.cashDeducted;
    const cur = d ? s.cash[d.account] : null;
    const refreshedAfter = !!(s.cash.updatedAt && e.checkedAt && s.cash.updatedAt > e.checkedAt);
    if (d && cur !== null && !refreshedAfter) next = { ...next, cash: { ...next.cash, [d.account]: cur + d.amount } };
    return next;
  });
}

/** 보유 현금을 실제 잔고로 맞춘다. 빈 칸(null)은 그대로 둔다 */
export function updateCash(v: { ISA: number | null; 직투: number | null }): void {
  setState((s) => ({
    ...s,
    cash: {
      ISA: v.ISA ?? s.cash.ISA,
      직투: v.직투 ?? s.cash.직투,
      updatedAt: nowIso(),
    },
  }));
}

/** 금액 기준 일정의 금액 변경. split은 전체 금액, signal은 한 번에 쓰는 금액 */
export function changeAmount(planId: string, newAmount: number, reason: string): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p) return s;
    const t = s.tickers.find((x) => x.id === p.tickerId);
    const cur = t?.currency ?? 'USD';
    const next = updatePlan(s, planId, (p) => ({ ...p, amount: newAmount }));
    const unit = p.ruleType === 'split' ? 'in total' : 'per buy';
    return log(next, 'qty-change', planLabel(p, s), `${fmtMoney(p.amount, cur)} → ${fmtMoney(newAmount, cur)} ${unit}`, reason, planId);
  });
}

export function changeQty(planId: string, newQty: number, reason: string): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p) return s;
    const next = updatePlan(s, planId, (p) =>
      p.ruleType === 'split'
        ? {
            ...p,
            dailyQty: newQty,
            entries: p.entries.map((e) => (e.actualQty === null ? { ...e, plannedQty: newQty } : e)),
          }
        : { ...p, dailyQty: newQty },
    );
    const unit = p.ruleType === 'split' ? 'per day' : 'per buy';
    return log(next, 'qty-change', planLabel(p, s), `${p.dailyQty} → ${newQty} shares ${unit}`, reason, planId);
  });
}

/** split은 '중단', signal/fixed는 '종료' */
export function stopPlan(planId: string, reason: string): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p) return s;
    const done = p.entries.filter((e) => e.actualQty !== null).length;
    const isSplit = p.ruleType === 'split';
    const next = updatePlan(s, planId, (p) => ({
      ...p,
      status: isSplit ? 'stopped' : 'done',
      endedAt: nowIso(),
    }));
    return log(
      next,
      isSplit ? 'stop' : 'end',
      planLabel(p, s),
      isSplit ? `Stopped after ${done} of ${p.entries.length} tranches` : `Ended after ${done} buys`,
      reason,
      planId,
    );
  });
}

export function deletePlan(planId: string, reason: string): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p) return s;
    const done = p.entries.filter((e) => e.actualQty !== null).length;
    const next = { ...s, plans: s.plans.filter((x) => x.id !== planId) };
    return log(next, 'delete', planLabel(p, s), `Plan deleted (had ${done} buys)`, reason, planId);
  });
}

export function setRemainderDone(planId: string, done: boolean): void {
  setState((s) => updatePlan(s, planId, (p) => ({ ...p, remainderDone: done })));
}

/** 사용자가 표시한 미국 휴장일들 */
function usHolidays(s: AppState): string[] {
  return s.closedDays.filter((c) => c.market === 'US').map((c) => c.date);
}

/** 규칙 외 매수 기록. 거래일은 그 종목 시장 기준 (국장: 서울, 미장: 프리마켓~주간거래, 휴장일은 건너뜀) */
export function addOffRule(t: Ticker, qty: number, price: number | null, reason: string): void {
  const priceText = price ? ` @ ${fmtMoney(price, t.currency)}` : '';
  setState((s) => {
    const next = log(s, 'off-rule', t.symbol, `${qty} ${qty === 1 ? 'share' : 'shares'}${priceText}`, reason);
    const [item, ...rest] = next.logs;
    return { ...next, logs: [{ ...item, buy: { tickerId: t.id, qty, price, date: tradeDay(marketOf(t), new Date(), usHolidays(s)) } }, ...rest] };
  });
}

/** 1달러 = 몇 원 */
export function updateFx(usdKrw: number): void {
  setState((s) => ({ ...s, fx: { usdKrw, updatedAt: nowIso() } }));
}

export function saveTicker(t: Ticker): void {
  setState((s) => {
    const exists = s.tickers.some((x) => x.id === t.id);
    return { ...s, tickers: exists ? s.tickers.map((x) => (x.id === t.id ? t : x)) : [...s.tickers, t] };
  });
}

export function deleteTicker(id: string): void {
  setState((s) => ({ ...s, tickers: s.tickers.filter((x) => x.id !== id) }));
}

function ruleSummary(r: Rule): string {
  if (r.type === 'split') return `${r.percent}% / ${r.days} days`;
  if (r.type === 'signal') return `${r.percent}% per signal`;
  return `${r.sharesPerDay} shares per signal`;
}

/** 이름만 바뀌었는지. 이름 변경은 매수 방식이 바뀌지 않으므로 이유를 묻지 않는다 */
export function onlyRenamed(old: Rule, r: Rule): boolean {
  return (
    old.name !== r.name &&
    old.group === r.group &&
    old.type === r.type &&
    old.percent === r.percent &&
    old.days === r.days &&
    old.sharesPerDay === r.sharesPerDay &&
    old.note === r.note
  );
}

/** 새 규칙·이름 변경은 이유 없이, 그 밖의 수정은 이유 필수 */
export function saveRule(r: Rule, reason: string | null): void {
  setState((s) => {
    const old = s.rules.find((x) => x.id === r.id);
    let next = { ...s, rules: old ? s.rules.map((x) => (x.id === r.id ? r : x)) : [...s.rules, r] };
    // 이름은 표시용이라 이 규칙으로 만든 일정에도 새 이름을 쓴다
    if (old && old.name !== r.name) next = { ...next, plans: next.plans.map((p) => (p.ruleId === r.id ? { ...p, ruleName: r.name } : p)) };
    if (!old || !reason) return next;
    const changes: string[] = [];
    if (old.name !== r.name) changes.push(`name ${old.name} → ${r.name}`);
    if (ruleSummary(old) !== ruleSummary(r)) changes.push(`${ruleSummary(old)} → ${ruleSummary(r)}`);
    if (old.group !== r.group) changes.push(`group ${ruleGroupLabel(old.group)} → ${ruleGroupLabel(r.group)}`);
    if (old.note !== r.note) changes.push('note edited');
    return log(next, 'rule-edit', `[${ruleGroupLabel(r.group)}] ${r.name}`, changes.join(', ') || 'no changes', reason);
  });
}

export function deleteRule(id: string, reason: string): void {
  setState((s) => {
    const r = s.rules.find((x) => x.id === id);
    if (!r) return s;
    return log({ ...s, rules: s.rules.filter((x) => x.id !== id) }, 'rule-delete', `[${ruleGroupLabel(r.group)}] ${r.name}`, ruleSummary(r), reason);
  });
}

/** 같은 그룹 안에서 규칙을 한 칸 위(-1) / 아래(+1)로 */
export function moveRule(id: string, dir: -1 | 1): void {
  setState((s) => {
    const r = s.rules.find((x) => x.id === id);
    if (!r) return s;
    const same = s.rules.filter((x) => x.group === r.group);
    const k = same.indexOf(r);
    const other = same[k + dir];
    if (!other) return s;
    const i = s.rules.indexOf(r);
    const j = s.rules.indexOf(other);
    const rules = [...s.rules];
    [rules[i], rules[j]] = [rules[j], rules[i]];
    return { ...s, rules };
  });
}

/** 규칙 그룹 순서를 한 칸 위 / 아래로. visible: 지금 화면에 보이는 그룹 순서 */
export function moveRuleGroup(g: RuleGroup, dir: -1 | 1, visible: RuleGroup[]): void {
  setState((s) => {
    const k = visible.indexOf(g);
    if (k < 0 || !visible[k + dir]) return s;
    const order = [...visible];
    [order[k], order[k + dir]] = [order[k + dir], order[k]];
    const rest = s.settings.ruleGroupOrder.filter((x) => !order.includes(x));
    return { ...s, settings: { ...s.settings, ruleGroupOrder: [...order, ...rest] } };
  });
}

/** 평일 휴장일 표시 / 해제 */
export function setMarketClosed(date: string, market: Market, closed: boolean): void {
  setState((s) => {
    const rest = s.closedDays.filter((c) => !(c.date === date && c.market === market));
    // 지난 표시는 쌓아 둘 필요가 없어 최근 60개만 남긴다
    return { ...s, closedDays: closed ? [...rest, { date, market }].slice(-60) : rest };
  });
}

export function saveCommonChecks(list: string[], reason: string): void {
  setState((s) => {
    const added = list.filter((x) => !s.commonChecks.includes(x));
    const removed = s.commonChecks.filter((x) => !list.includes(x));
    const detail = [...removed.map((x) => `− ${x}`), ...added.map((x) => `+ ${x}`)].join('\n') || 'order changed';
    return log({ ...s, commonChecks: list }, 'rule-edit', 'Common rules checklist', detail, reason);
  });
}

export function addSaving(v: Omit<Saving, 'id'>): void {
  setState((s) => ({ ...s, savings: [{ ...v, id: uid() }, ...s.savings] }));
}

export function deleteSaving(id: string): void {
  setState((s) => ({ ...s, savings: s.savings.filter((x) => x.id !== id) }));
}

export function setSavingsTarget(n: number): void {
  setState((s) => ({ ...s, settings: { ...s.settings, savingsTarget: n } }));
}

export function markBackedUp(): void {
  setState((s) => ({ ...s, settings: { ...s.settings, lastBackupAt: nowIso() } }));
}

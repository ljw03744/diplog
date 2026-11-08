import { calcPlan, makeEntries } from './calc';
import { groupLabel } from './labels';
import { setState, getState } from './store';
import type { AppState, Currency, LogItem, LogKind, Plan, Rule, Saving, Ticker } from './types';
import { nowIso, uid } from './util';

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
  const c = calcPlan({
    type: i.rule.type,
    seed: i.seed,
    seedCurrency: i.seedCurrency,
    tickerCurrency: i.ticker.currency,
    fxRate: i.fxRate,
    price: i.price,
    percent: i.rule.percent,
    days: i.rule.days,
    sharesPerDay: i.rule.sharesPerDay,
  });
  const plan: Plan = {
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
    amount: c.amount,
    totalQty: c.totalQty,
    dailyQty: c.dailyQty,
    remainder: c.remainder,
    remainderDone: false,
    entries: makeEntries(i.rule.type, i.rule.days, c.dailyQty),
    status: 'active',
    createdAt: nowIso(),
    endedAt: null,
  };
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

/** 오늘 회차 체크. qty가 계획과 다르면 reason 필수 */
export function checkToday(planId: string, today: string, qty: number, reason: string | null): void {
  setState((s) => {
    const p = s.plans.find((x) => x.id === planId);
    if (!p || p.status !== 'active' || p.entries.some((e) => e.date === today)) return s;
    let next: AppState;
    let planned: number;
    let n: number;
    if (p.ruleType === 'split') {
      const target = p.entries.find((e) => e.actualQty === null);
      if (!target) return s;
      planned = target.plannedQty;
      n = target.n;
      const entries = p.entries.map((e) => (e === target ? { ...e, date: today, actualQty: qty } : e));
      const finished = entries.every((e) => e.actualQty !== null);
      next = updatePlan(s, planId, (p) => ({
        ...p,
        entries,
        status: finished ? 'done' : 'active',
        endedAt: finished ? nowIso() : null,
      }));
    } else {
      planned = p.dailyQty;
      n = p.entries.length + 1;
      next = updatePlan(s, planId, (p) => ({
        ...p,
        entries: [...p.entries, { n, plannedQty: planned, date: today, actualQty: qty }],
      }));
    }
    if (planned !== qty) {
      next = log(next, 'qty-diff', planLabel(p, s), `Round ${n}: planned ${planned}, bought ${qty}`, reason ?? '', planId);
    }
    return next;
  });
}

/** 오늘 체크 취소 (잘못 누른 경우). 같은 날만 가능 */
export function uncheckToday(planId: string, today: string): void {
  setState((s) =>
    updatePlan(s, planId, (p) => {
      if (p.ruleType === 'split') {
        const entries = p.entries.map((e) => (e.date === today ? { ...e, date: null, actualQty: null } : e));
        return { ...p, entries, status: 'active', endedAt: null };
      }
      return { ...p, entries: p.entries.filter((e) => e.date !== today) };
    }),
  );
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
      isSplit ? `Stopped after ${done} of ${p.entries.length} rounds` : `Ended after ${done} buys`,
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

export function addOffRule(label: string, qty: number, price: number | null, currency: Currency, reason: string): void {
  const priceText = price ? ` @ ${currency === 'USD' ? '$' + price : '₩' + price.toLocaleString('en-US')}` : '';
  setState((s) => log(s, 'off-rule', label, `${qty} ${qty === 1 ? 'share' : 'shares'}${priceText}`, reason));
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

/** 새 규칙은 이유 없이, 기존 규칙 수정은 이유 필수 */
export function saveRule(r: Rule, reason: string | null): void {
  setState((s) => {
    const old = s.rules.find((x) => x.id === r.id);
    const next = { ...s, rules: old ? s.rules.map((x) => (x.id === r.id ? r : x)) : [...s.rules, r] };
    if (!old || !reason) return next;
    const changes: string[] = [];
    if (old.name !== r.name) changes.push(`name ${old.name} → ${r.name}`);
    if (ruleSummary(old) !== ruleSummary(r)) changes.push(`${ruleSummary(old)} → ${ruleSummary(r)}`);
    if (old.group !== r.group) changes.push(`group ${groupLabel(old.group)} → ${groupLabel(r.group)}`);
    if (old.note !== r.note) changes.push('note edited');
    return log(next, 'rule-edit', `[${groupLabel(r.group)}] ${r.name}`, changes.join(', ') || 'no changes', reason);
  });
}

export function deleteRule(id: string, reason: string): void {
  setState((s) => {
    const r = s.rules.find((x) => x.id === id);
    if (!r) return s;
    return log({ ...s, rules: s.rules.filter((x) => x.id !== id) }, 'rule-delete', `[${groupLabel(r.group)}] ${r.name}`, ruleSummary(r), reason);
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

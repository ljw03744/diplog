import { useState } from 'react';
import { budgetFor, setMarketClosed, uncheckToday } from '../actions';
import { boughtQty, compliance, isClosed, isWeekend, marketOf, progress, todayState } from '../calc';
import { IconCheck } from '../icons';
import { accountLabel, MARKET_LABEL, shares } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { AppState, Market, Plan } from '../types';
import { Bar, Empty, Logo, Sheet, UnderlineTabs } from '../ui';
import { daysBetween, fmtDate, fmtDay, fmtMoney, KST, tradeDay } from '../util';
import { BuySheet } from './BuySheet';
import { CashCard } from './Cash';

/** 시장마다 오늘 거래일. 국장은 서울 날짜, 미장은 뉴욕 날짜 */
export type Days = Record<Market, string>;

export function currentDays(): Days {
  return { KR: tradeDay('KR'), US: tradeDay('US') };
}

/** 이 일정 종목의 오늘 거래일 */
function dayOf(s: AppState, p: Plan, days: Days): string {
  return days[marketOf(s.tickers.find((x) => x.id === p.tickerId))];
}

export function TodayTab() {
  const s = useAppState();
  const [mode, setMode] = useState<'today' | 'ticker'>('today');
  const days = currentDays();
  const weekend = MARKETS.every((m) => isWeekend(days[m]));
  const todo = s.plans.filter((p) => todayState(p, dayOf(s, p, days)).kind === 'todo' && planOpen(s, p, days)).length;
  const doneToday = s.plans.filter((p) => p.entries.some((e) => e.date === dayOf(s, p, days))).length;
  const dateLine = new Date().toLocaleDateString('en-US', { timeZone: KST, weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="tab">
      <header className="tab-head">
        <div className="eyebrow">{dateLine}</div>
        <h1>
          {weekend ? (
            'Markets are closed'
          ) : todo > 0 ? (
            <>
              <em>{todo}</em> to buy today
            </>
          ) : doneToday > 0 ? (
            'All done for today'
          ) : (
            'Nothing to buy today'
          )}
        </h1>
      </header>
      <BackupBanner s={s} />
      <CashCard />
      <Summary s={s} />
      <UnderlineTabs
        value={mode}
        onChange={setMode}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'ticker', label: 'By ticker' },
        ]}
      />
      {mode === 'today' ? <TodayList s={s} days={days} /> : <ByTicker s={s} />}
    </div>
  );
}

function Summary({ s }: { s: AppState }) {
  const offRule = s.logs.filter((l) => l.kind === 'off-rule').length;
  const c = compliance(s.plans, offRule);
  if (c.total === 0) return null;
  const rate = c.rate ?? 0;
  return (
    <section className="card summary">
      <div className="summary-top">
        <div>
          <div className="card-label">Rule adherence</div>
          <div className="big-num">
            {Math.round(rate * 100)}
            <small>%</small>
          </div>
        </div>
        <div className="summary-side">
          As planned {c.asPlanned}
          <br />
          Deviations {c.total - c.asPlanned}
        </div>
      </div>
      <Bar value={rate} />
    </section>
  );
}

function BackupBanner({ s }: { s: AppState }) {
  const hasData = s.plans.length > 0 || s.logs.length > 0 || s.savings.length > 0;
  if (!hasData) return null;
  const last = s.settings.lastBackupAt;
  const days = last ? daysBetween(last) : null;
  if (days !== null && days < 7) return null;
  return (
    <div className="banner">
      {days === null ? "You haven't backed up yet." : `Your last backup was ${days} days ago.`} Export a JSON backup in Settings.
    </div>
  );
}

/** 이 일정의 종목이 거래되는 장이 오늘 열리는지 */
function planOpen(s: AppState, p: Plan, days: Days): boolean {
  const m = marketOf(s.tickers.find((x) => x.id === p.tickerId));
  return !isClosed(m, days[m], s.closedDays);
}

function TodayList({ s, days }: { s: AppState; days: Days }) {
  const [closedSheet, setClosedSheet] = useState(false);
  const active = s.plans.filter((p) => p.status === 'active');

  if (MARKETS.every((m) => isWeekend(days[m])))
    return (
      <Empty>
        No buying on weekends.
        <br />
        {active.length > 0 ? 'Your plans pick up again on Monday.' : 'When a rule signal fires, add a plan with the ＋ button.'}
      </Empty>
    );

  const boughtToday = (p: Plan) => p.entries.some((e) => e.date === dayOf(s, p, days));
  const closed = MARKETS.filter((m) => isClosed(m, days[m], s.closedDays));
  const holidays = closed.filter((m) => !isWeekend(days[m]));
  const openMarkets = MARKETS.filter((m) => !isWeekend(days[m]));
  const skipped = active.filter((p) => !planOpen(s, p, days) && !boughtToday(p));
  const doneToday = s.plans.filter((p) => p.status === 'done' && boughtToday(p));
  // What's left goes on top, what's done today goes to the bottom
  const list = [...active.filter((p) => !skipped.includes(p)), ...doneToday].sort((a, b) => Number(boughtToday(a)) - Number(boughtToday(b)));

  return (
    <>
      {closed.length > 0 && (
        <div className="closed-note">
          <span>
            {closed.map((m) => `${MARKET_LABEL[m]} market ${isWeekend(days[m]) ? 'closed (weekend)' : 'holiday'}`).join(' · ')}
            {skipped.length > 0 && ` · ${skipped.length} ${skipped.length === 1 ? 'plan' : 'plans'} skipped`}
          </span>
          {holidays.length > 0 && (
            <button className="qty-link" onClick={() => setClosedSheet(true)}>
              Change
            </button>
          )}
        </div>
      )}
      {list.length === 0 ? (
        <Empty>
          {active.length === 0 ? (
            <>
              No buys in progress.
              <br />
              When a rule signal fires, add a plan with the ＋ button.
            </>
          ) : (
            'Nothing to buy in the markets open today.'
          )}
        </Empty>
      ) : (
        <section className="card list-card">
          {list.map((p) => (
            <TodayRow key={p.id} plan={p} s={s} today={dayOf(s, p, days)} />
          ))}
        </section>
      )}
      {holidays.length < openMarkets.length && (
        <button className="text-btn" onClick={() => setClosedSheet(true)}>
          Market holiday today?
        </button>
      )}
      {closedSheet && <ClosedSheet s={s} days={days} markets={openMarkets} onClose={() => setClosedSheet(false)} />}
    </>
  );
}

const MARKETS: Market[] = ['KR', 'US'];

/** 휴장일 표시: 버튼을 누른 뒤 쉬는 장을 고른다 (국장·미장 휴장일이 다르다). 주말인 장은 보이지 않는다 */
function ClosedSheet({ s, days, markets, onClose }: { s: AppState; days: Days; markets: Market[]; onClose: () => void }) {
  const [pick, setPick] = useState<Market[]>(markets.filter((m) => s.closedDays.some((c) => c.date === days[m] && c.market === m)));
  const count = (m: Market) => s.plans.filter((p) => p.status === 'active' && marketOf(s.tickers.find((t) => t.id === p.tickerId)) === m).length;
  const toggle = (m: Market) => setPick((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]));
  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">Which market has a holiday today?</h2>
      <p className="muted">Plans for that market are skipped today and continue on the next trading day.</p>
      <div className="checks">
        {markets.map((m) => (
          <label key={m} className="check-row">
            <input type="checkbox" checked={pick.includes(m)} onChange={() => toggle(m)} />
            <span>
              {m === 'KR' ? 'Korea (KRX)' : 'US (NYSE · Nasdaq)'}
              <span className="muted small">
                {' '}
                · {fmtDay(days[m])} session · {count(m)} active {count(m) === 1 ? 'plan' : 'plans'}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="row gap">
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary grow"
          onClick={() => {
            markets.forEach((m) => setMarketClosed(days[m], m, pick.includes(m)));
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

function TodayRow({ plan, s, today }: { plan: Plan; s: AppState; today: string }) {
  const nav = useNav();
  const [buyOpen, setBuyOpen] = useState(false);
  const t = s.tickers.find((x) => x.id === plan.tickerId);
  const cur = t?.currency ?? 'USD';
  const st = todayState(plan, today);
  const budget = budgetFor(plan, s);
  const doneEntry = plan.entries.find((e) => e.date === today);
  const pr = progress(plan);
  const isSplit = plan.ruleType === 'split';

  const stepLabel =
    st.kind === 'todo' && st.entry
      ? `Tranche ${st.entry.n} of ${pr.total}`
      : isSplit
        ? `${pr.done} of ${pr.total} tranches`
        : plan.ruleType === 'fixed'
          ? `Fixed · bought ${pr.done}×`
          : `Per signal · bought ${pr.done}×`;
  const showRemainder = isSplit && plan.remainder > 0 && plan.status === 'done' && !plan.remainderDone;

  return (
    <>
      <div className={'trow' + (doneEntry ? ' is-done' : '')}>
        <Logo symbol={t?.symbol} group={t?.group} />
        <button className="trow-main" onClick={() => nav.push({ name: 'plan', id: plan.id })}>
          <span className="trow-title">
            {t?.symbol ?? 'Deleted ticker'}
            {t && <span className="tag">{accountLabel(t.account)}</span>}
          </span>
          <span className="trow-sub">
            {plan.ruleName} · {stepLabel}
          </span>
          {isSplit && pr.total ? <Bar value={pr.done / pr.total} thin /> : null}
        </button>

        {doneEntry ? (
          <>
            <div className="trow-qty">
              <span className="qty">{shares(doneEntry.actualQty ?? 0)}</span>
              {doneEntry.cost != null && <span className="muted small">{fmtMoney(doneEntry.cost, cur)}</span>}
              {doneEntry.actualQty !== doneEntry.plannedQty ? (
                <span className="warn-text small">plan {doneEntry.plannedQty}</span>
              ) : (
                <button className="qty-link" onClick={() => uncheckToday(plan.id, today)}>
                  Undo
                </button>
              )}
            </div>
            <span className="check on" aria-label="Bought today">
              <IconCheck />
            </span>
          </>
        ) : st.kind === 'todo' ? (
          <>
            <button className="trow-qty" onClick={() => setBuyOpen(true)}>
              <span className="qty">{budget !== null ? fmtMoney(budget, cur) : shares(st.qty)}</span>
              <span className="qty-link">Enter price</span>
            </button>
            <button className="check" aria-label="Check today's buy" onClick={() => setBuyOpen(true)}>
              <IconCheck />
            </button>
          </>
        ) : null}
      </div>

      {doneEntry && doneEntry.actualQty !== doneEntry.plannedQty && (
        <div className="trow-note">
          <button className="qty-link" onClick={() => uncheckToday(plan.id, today)}>
            Undo check
          </button>
        </div>
      )}
      {showRemainder && <div className="trow-note">You can check off the {plan.remainder} remaining shares in the plan details.</div>}

      {buyOpen && <BuySheet plan={plan} today={today} onClose={() => setBuyOpen(false)} />}
    </>
  );
}

function ByTicker({ s }: { s: AppState }) {
  const nav = useNav();
  const groups = s.tickers
    .map((t) => ({ t, plans: s.plans.filter((p) => p.tickerId === t.id) }))
    .filter((g) => g.plans.length > 0);
  if (groups.length === 0) return <Empty>No buy plans yet.</Empty>;
  return (
    <div className="stack">
      {groups.map(({ t, plans }) => {
        const active = plans.filter((p) => p.status === 'active');
        const past = plans.filter((p) => p.status !== 'active');
        return (
          <section key={t.id} className="card ticker-card">
            <div className="ticker-head">
              <Logo symbol={t.symbol} group={t.group} />
              <div className="trow-main">
                <span className="trow-title">
                  {t.symbol}
                  <span className="tag">{accountLabel(t.account)}</span>
                </span>
                <span className="trow-sub">{t.name}</span>
              </div>
            </div>
            {active.length === 0 && <div className="muted small">No plan in progress</div>}
            {active.map((p) => (
              <PlanRow key={p.id} p={p} onClick={() => nav.push({ name: 'plan', id: p.id })} />
            ))}
            {past.length > 0 && (
              <details className="past">
                <summary>
                  {past.length} past {past.length === 1 ? 'plan' : 'plans'}
                </summary>
                {past.map((p) => (
                  <PlanRow key={p.id} p={p} onClick={() => nav.push({ name: 'plan', id: p.id })} />
                ))}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function PlanRow({ p, onClick }: { p: Plan; onClick: () => void }) {
  const pr = progress(p);
  const status = p.status === 'active' ? '' : p.status === 'done' ? 'Done' : 'Stopped';
  return (
    <button className="plan-row" onClick={onClick}>
      <div className="row between">
        <span>{p.ruleName}</span>
        <span className="muted small">
          {status && <span className={'tag ' + (p.status === 'stopped' ? 'tag-warn' : '')}>{status}</span>} {shares(boughtQty(p))} · {fmtDate(p.createdAt)}
        </span>
      </div>
      {pr.total ? <Bar value={pr.done / pr.total} thin /> : null}
    </button>
  );
}

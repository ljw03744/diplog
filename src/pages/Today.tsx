import { useState } from 'react';
import { checkToday, uncheckToday } from '../actions';
import { boughtQty, compliance, progress, todayState } from '../calc';
import { IconCheck } from '../icons';
import { accountLabel, shares } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { AppState, Plan } from '../types';
import { Bar, Empty, Field, Logo, NumInput, ReasonSheet, UnderlineTabs } from '../ui';
import { daysBetween, fmtDate, parseNum, todayStr } from '../util';

export function TodayTab() {
  const s = useAppState();
  const [mode, setMode] = useState<'today' | 'ticker'>('today');
  const today = todayStr();
  const todo = s.plans.filter((p) => todayState(p, today).kind === 'todo').length;
  const doneToday = s.plans.filter((p) => p.entries.some((e) => e.date === today)).length;
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="tab">
      <header className="tab-head">
        <div className="eyebrow">{dateLine}</div>
        <h1>
          {todo > 0 ? (
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
      <Summary s={s} />
      <UnderlineTabs
        value={mode}
        onChange={setMode}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'ticker', label: 'By ticker' },
        ]}
      />
      {mode === 'today' ? <TodayList s={s} today={today} /> : <ByTicker s={s} />}
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
          On plan {c.asPlanned}
          <br />
          Off plan {c.total - c.asPlanned}
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

function TodayList({ s, today }: { s: AppState; today: string }) {
  const active = s.plans.filter((p) => p.status === 'active');
  const doneToday = s.plans.filter((p) => p.status === 'done' && p.entries.some((e) => e.date === today));
  // What's left goes on top, what's done today goes to the bottom
  const list = [...active, ...doneToday].sort(
    (a, b) => Number(a.entries.some((e) => e.date === today)) - Number(b.entries.some((e) => e.date === today)),
  );
  if (list.length === 0)
    return (
      <Empty>
        No buys in progress.
        <br />
        When a rule signal fires, add a plan with the ＋ button.
      </Empty>
    );
  return (
    <section className="card list-card">
      {list.map((p) => (
        <TodayRow key={p.id} plan={p} s={s} today={today} />
      ))}
    </section>
  );
}

function TodayRow({ plan, s, today }: { plan: Plan; s: AppState; today: string }) {
  const nav = useNav();
  const [diffOpen, setDiffOpen] = useState(false);
  const [qty, setQty] = useState('');
  const t = s.tickers.find((x) => x.id === plan.tickerId);
  const st = todayState(plan, today);
  const doneEntry = plan.entries.find((e) => e.date === today);
  const pr = progress(plan);
  const isSplit = plan.ruleType === 'split';

  const plannedQty = st.kind === 'todo' ? st.qty : 0;
  const stepLabel =
    st.kind === 'todo' && st.entry
      ? `Round ${st.entry.n} of ${pr.total}`
      : isSplit
        ? `${pr.done} of ${pr.total} rounds`
        : plan.ruleType === 'fixed'
          ? `Fixed · bought ${pr.done}×`
          : `Per signal · bought ${pr.done}×`;
  const parsed = parseNum(qty);
  const qtyValid = Number.isInteger(parsed) && parsed >= 0 && parsed !== plannedQty;
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
            <div className="trow-qty">
              <span className="qty">{shares(st.qty)}</span>
              <button className="qty-link" onClick={() => setDiffOpen(true)}>
                Other amount
              </button>
            </div>
            <button className="check" aria-label={`Bought ${shares(st.qty)} as planned`} onClick={() => checkToday(plan.id, today, st.qty, null)}>
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
      {showRemainder && <div className="trow-note">You can check off the {plan.remainder} leftover in the plan details.</div>}

      {diffOpen && (
        <ReasonSheet
          title="Different from plan"
          description={`The plan says ${shares(plannedQty)}. Enter what you actually bought and why.`}
          confirmLabel="Log and check"
          extraValid={qtyValid}
          onClose={() => setDiffOpen(false)}
          onConfirm={(reason) => {
            checkToday(plan.id, today, parsed, reason);
            setDiffOpen(false);
            setQty('');
          }}
        >
          <Field label="Shares bought">
            <NumInput value={qty} onChange={setQty} suffix="shares" decimal={false} />
          </Field>
        </ReasonSheet>
      )}
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

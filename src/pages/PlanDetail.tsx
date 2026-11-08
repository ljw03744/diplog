import { useState } from 'react';
import { changeQty, deletePlan, setRemainderDone, stopPlan } from '../actions';
import { boughtQty, progress } from '../calc';
import { IconCheck } from '../icons';
import { shares } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import { Bar, Empty, Field, NumInput, Page, ReasonSheet } from '../ui';
import { fmtDate, fmtDay, fmtMoney, parseNum } from '../util';
import { LogCard } from './Logs';

type Dialog = 'qty' | 'stop' | 'delete' | null;

export function PlanDetailPage({ id }: { id: string }) {
  const s = useAppState();
  const nav = useNav();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [qty, setQty] = useState('');
  const plan = s.plans.find((p) => p.id === id);
  if (!plan)
    return (
      <Page title="Plan">
        <Empty>This plan was deleted.</Empty>
      </Page>
    );

  const t = s.tickers.find((x) => x.id === plan.tickerId);
  const cur = t?.currency ?? 'USD';
  const pr = progress(plan);
  const isSplit = plan.ruleType === 'split';
  const logs = s.logs.filter((l) => l.planId === plan.id);
  const parsed = parseNum(qty);
  const qtyValid = Number.isInteger(parsed) && parsed > 0 && parsed !== plan.dailyQty;
  const statusText = plan.status === 'active' ? 'In progress' : plan.status === 'done' ? 'Done' : 'Stopped';
  const unit = isSplit ? 'a day' : 'per buy';

  return (
    <Page title="" back="Back">
      <section className="card hero">
        <div className="card-label">
          {plan.ruleName} · {isSplit ? 'Split' : plan.ruleType === 'fixed' ? 'Fixed shares' : 'Per signal'}
        </div>
        <div className="hero-title">
          {t?.symbol ?? 'Deleted ticker'}
          <span className={'tag' + (plan.status === 'stopped' ? ' tag-warn' : plan.status === 'active' ? ' tag-accent' : '')}>{statusText}</span>
        </div>
        <div className="hero-nums">
          <div>
            <div className="label">Bought</div>
            <div className="big-num">{boughtQty(plan)}</div>
          </div>
          {isSplit ? (
            <>
              <div>
                <div className="label">Target</div>
                <div className="big-num dim">{plan.totalQty}</div>
              </div>
              {plan.remainder > 0 && (
                <div>
                  <div className="label">Leftover</div>
                  <div className="big-num dim">{plan.remainder}</div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="label">Buys</div>
              <div className="big-num dim">{pr.done}</div>
            </div>
          )}
        </div>
        {isSplit && pr.total ? <Bar value={pr.done / pr.total} /> : null}
      </section>

      <h3 className="section-title">Plan</h3>
      <section className="card">
        <dl className="facts">
          {plan.ruleType !== 'fixed' && (
            <>
              <dt>Seed</dt>
              <dd>{fmtMoney(plan.seed, plan.seedCurrency)}</dd>
              <dt>Allocation</dt>
              <dd>
                {plan.percent}% = {fmtMoney(plan.amount, cur)}
              </dd>
            </>
          )}
          {plan.price > 0 && (
            <>
              <dt>Base price</dt>
              <dd>{fmtMoney(plan.price, cur)}</dd>
            </>
          )}
          {plan.seedCurrency !== cur && plan.ruleType !== 'fixed' && (
            <>
              <dt>Exchange rate</dt>
              <dd>₩{plan.fxRate.toLocaleString('en-US')} / $1</dd>
            </>
          )}
          <dt>{isSplit ? 'Per day' : 'Per buy'}</dt>
          <dd>{shares(plan.dailyQty)}</dd>
          <dt>Started</dt>
          <dd>{fmtDate(plan.createdAt)}</dd>
          {plan.endedAt && (
            <>
              <dt>Ended</dt>
              <dd>{fmtDate(plan.endedAt)}</dd>
            </>
          )}
        </dl>
      </section>

      <h3 className="section-title">Rounds</h3>
      <section className="card">
        {plan.entries.length === 0 && <div className="muted small">No buys yet.</div>}
        <ol className="entries">
          {plan.entries.map((e) => {
            const isNext = plan.status === 'active' && e.actualQty === null && e === plan.entries.find((x) => x.actualQty === null);
            return (
              <li key={e.n} className={e.actualQty !== null ? 'done' : isNext ? 'next' : 'todo'}>
                <span className="entry-n">
                  Round {e.n}
                  {e.date && <span className="entry-date">{fmtDay(e.date)}</span>}
                  {isNext && <span className="entry-date">next</span>}
                </span>
                <span className="entry-qty">
                  {e.actualQty !== null ? (
                    <>
                      {shares(e.actualQty)}
                      {e.actualQty !== e.plannedQty && <span className="warn-text">plan {e.plannedQty}</span>}
                      <span className="tick" aria-label="Bought">
                        <IconCheck />
                      </span>
                    </>
                  ) : (
                    <span className={isNext ? '' : 'muted'}>{shares(e.plannedQty)}</span>
                  )}
                </span>
              </li>
            );
          })}
          {isSplit && plan.remainder > 0 && (
            <li className={plan.remainderDone ? 'done' : 'todo'}>
              <span className="entry-n">Leftover (optional)</span>
              <label className="entry-qty">
                {shares(plan.remainder)}
                <input type="checkbox" checked={plan.remainderDone} onChange={(e) => setRemainderDone(plan.id, e.target.checked)} />
              </label>
            </li>
          )}
        </ol>
      </section>

      {plan.status === 'active' && (
        <>
          <div className="actions">
            <button className="btn ghost" onClick={() => setDialog('qty')}>
              Change amount
            </button>
            <button className="btn ghost" onClick={() => setDialog('stop')}>
              {isSplit ? 'Stop' : 'End'}
            </button>
          </div>
          <div className="actions-hint">Changing or stopping needs a written reason</div>
        </>
      )}
      <button className="text-btn danger-text" onClick={() => setDialog('delete')}>
        Delete plan
      </button>

      {logs.length > 0 && (
        <>
          <h3 className="section-title">Log for this plan</h3>
          <div className="stack">
            {logs.map((l) => (
              <LogCard key={l.id} l={l} />
            ))}
          </div>
        </>
      )}

      {dialog === 'qty' && (
        <ReasonSheet
          title="Change amount"
          description={`Right now it's ${shares(plan.dailyQty)} ${unit}.${isSplit ? ' The change applies to the remaining rounds.' : ''}`}
          confirmLabel="Change"
          extraValid={qtyValid}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            changeQty(plan.id, parsed, reason);
            setDialog(null);
            setQty('');
          }}
        >
          <Field label="New amount">
            <NumInput value={qty} onChange={setQty} suffix="shares" decimal={false} />
          </Field>
        </ReasonSheet>
      )}
      {dialog === 'stop' && (
        <ReasonSheet
          title={isSplit ? 'Stop plan' : 'End plan'}
          description={
            isSplit ? `You've bought ${pr.done} of ${pr.total} rounds. The remaining rounds won't be bought.` : "It won't show up on Today anymore."
          }
          confirmLabel={isSplit ? 'Stop' : 'End'}
          danger={isSplit}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            stopPlan(plan.id, reason);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'delete' && (
        <ReasonSheet
          title="Delete plan"
          description="The plan is removed, but the fact that you deleted it and your reason stay in the log."
          confirmLabel="Delete"
          danger
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            deletePlan(plan.id, reason);
            setDialog(null);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

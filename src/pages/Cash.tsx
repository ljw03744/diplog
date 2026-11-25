import { useState } from 'react';
import { updateCash } from '../actions';
import { useAppState } from '../store';
import type { AppState } from '../types';
import { Field, NumInput, Sheet } from '../ui';
import { daysBetween, fmtDate, fmtMoney, parseNum } from '../util';

/** 이 기간 동안 실제 잔고로 맞추지 않으면 첫 화면에서 최신화를 권한다 */
export const CASH_REFRESH_DAYS = 14;

export function cashAge(s: AppState): number | null {
  return s.cash.updatedAt ? daysBetween(s.cash.updatedAt) : null;
}

export function cashIsStale(s: AppState): boolean {
  const age = cashAge(s);
  return age === null || age >= CASH_REFRESH_DAYS;
}

function ago(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** 첫 화면의 보유 현금 카드. 2주가 지났거나 입력한 적 없으면 최신화 버튼을 크게 띄운다 */
export function CashCard() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const age = cashAge(s);
  const stale = cashIsStale(s);

  return (
    <>
      {age === null ? (
        <section className="card cash-card stale">
          <div className="card-label">Cash</div>
          <p className="small">Enter the cash in your ISA and US accounts. DipLog uses it to tell you how many shares to buy, and subtracts every buy you check.</p>
          <button className="btn primary block" onClick={() => setOpen(true)}>
            Enter cash balance
          </button>
        </section>
      ) : (
        <section className={'card cash-card' + (stale ? ' stale' : '')}>
          <div className="row between">
            <span className="card-label">Cash</span>
            {!stale && (
              <button className="qty-link" onClick={() => setOpen(true)}>
                Update
              </button>
            )}
          </div>
          <div className="cash-grid">
            <div>
              <span className="label">ISA</span>
              <b>{s.cash.ISA === null ? '—' : fmtMoney(s.cash.ISA, 'KRW')}</b>
            </div>
            <div>
              <span className="label">US</span>
              <b>{s.cash.직투 === null ? '—' : fmtMoney(s.cash.직투, 'USD')}</b>
            </div>
          </div>
          {stale ? (
            <>
              <p className="warn-text small">
                You last matched this to your real balance {ago(age)}. Small gaps add up, so update it every two weeks.
              </p>
              <button className="btn primary block" onClick={() => setOpen(true)}>
                Update cash balance
              </button>
            </>
          ) : (
            <div className="muted small">
              Matched to your balance {ago(age)} · checked buys are subtracted
            </div>
          )}
        </section>
      )}
      {open && <CashSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function CashSheet({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const [isa, setIsa] = useState('');
  const [direct, setDirect] = useState('');
  const a = parseNum(isa);
  const b = parseNum(direct);
  const ok = a >= 0 && b >= 0;
  const est = s.cash.updatedAt !== null;

  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">Update cash balance</h2>
      <p className="muted">
        Enter the cash your brokerage app shows right now.
        {est && ` The estimate below is your balance from ${fmtDate(s.cash.updatedAt!)} minus the buys you checked since.`}
      </p>
      <Field label="ISA cash" hint={est && s.cash.ISA !== null ? `Estimate ${fmtMoney(s.cash.ISA, 'KRW')}` : undefined}>
        <NumInput value={isa} onChange={setIsa} placeholder="0" suffix="₩" decimal={false} />
      </Field>
      <Field label="US cash" hint={est && s.cash.직투 !== null ? `Estimate ${fmtMoney(s.cash.직투, 'USD')}` : undefined}>
        <NumInput value={direct} onChange={setDirect} placeholder="0" suffix="$" />
      </Field>
      <div className="row gap">
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary grow"
          disabled={!ok}
          onClick={() => {
            updateCash({ ISA: a, 직투: b });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

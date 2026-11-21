import { useState } from 'react';
import { checkToday, MIN_REASON, previewBuy } from '../actions';
import { progress } from '../calc';
import { accountLabel, shares } from '../labels';
import { useAppState } from '../store';
import type { Plan } from '../types';
import { Field, NumInput, ReasonInput, Sheet } from '../ui';
import { fmtMoney, parseNum } from '../util';

/**
 * 오늘 회차 체크. 지금 가격을 넣으면 오늘 금액과 보유 현금으로 몇 주를 살지 알려 준다.
 * 계획과 다르게 샀으면 이유를 적는다.
 */
export function BuySheet({ plan, today, onClose }: { plan: Plan; today: string; onClose: () => void }) {
  const s = useAppState();
  const t = s.tickers.find((x) => x.id === plan.tickerId);
  const cur = t?.currency ?? 'USD';
  const [price, setPrice] = useState(plan.sizing === 'amount' ? '' : plan.price > 0 ? String(plan.price) : '');
  const [diff, setDiff] = useState(false);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  const p = parseNum(price);
  const pv = previewBuy(plan, p, s);
  const priceOk = p > 0;
  const pr = progress(plan);
  const next = plan.entries.find((e) => e.actualQty === null);
  const step = plan.ruleType === 'split' && next ? `Tranche ${next.n} of ${pr.total}` : 'Signal day';
  const acc = pv.account ? accountLabel(pv.account) : null;
  const cashCur = pv.account === 'ISA' ? 'KRW' : 'USD';

  const other = parseNum(qty);
  const diffOk = Number.isInteger(other) && other >= 0 && other !== pv.qty && reason.trim().length >= MIN_REASON;
  const otherCost = Number.isInteger(other) && other >= 0 ? other * p : null;

  function confirm(q: number, why: string | null) {
    checkToday(plan.id, today, p, q, why);
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">
        {t?.symbol ?? 'Deleted ticker'} · {plan.ruleName}
      </h2>
      <div className="buy-budget">
        <span className="muted small">{step}</span>
        {pv.budget !== null ? (
          <span>
            Today's order amount <b>{fmtMoney(pv.budget, cur)}</b>
          </span>
        ) : (
          <span>
            Plan <b>{shares(plan.ruleType === 'split' ? (next?.plannedQty ?? 0) : plan.dailyQty)}</b>
          </span>
        )}
      </div>

      <Field label={`${t?.symbol ?? ''} current price`}>
        <NumInput value={price} onChange={setPrice} placeholder="0" suffix={cur === 'USD' ? '$' : '₩'} />
      </Field>

      {priceOk && (
        <section className={'result' + (pv.problem ? ' bad' : '')}>
          {pv.problem ? (
            <p>{pv.problem}</p>
          ) : (
            <>
              <div className="result-main">
                Buy <b>{shares(pv.qty)}</b>
              </div>
              <div className="result-sub">{fmtMoney(pv.cost, cur)}</div>
            </>
          )}
          {pv.cash !== null && pv.toCash !== null && acc && (
            <div className="result-sub muted">
              {acc} cash {fmtMoney(pv.cash, cashCur)} → {fmtMoney(pv.cashAfter ?? pv.cash, cashCur)}
            </div>
          )}
        </section>
      )}
      {priceOk && pv.capped && (
        <p className="warn-text small">
          Today's amount is more than your {acc} cash, so this is cut to what your cash can buy. If your cash is out of date, update it first.
        </p>
      )}
      {priceOk && pv.cash === null && acc && (
        <p className="muted small">You haven't entered your {acc} cash, so this isn't checked against your balance.</p>
      )}

      {priceOk && !diff && (
        <>
          <button className="btn primary block" onClick={() => confirm(pv.qty, null)}>
            {pv.qty > 0 ? `Bought ${shares(pv.qty)}` : 'Record 0 shares'}
          </button>
          <button className="text-btn" onClick={() => setDiff(true)}>
            I bought a different number
          </button>
        </>
      )}

      {priceOk && diff && (
        <div className="stack">
          <Field label="Shares bought" hint={otherCost !== null && qty ? fmtMoney(otherCost, cur) : undefined}>
            <NumInput value={qty} onChange={setQty} suffix="shares" decimal={false} />
          </Field>
          <Field label={`Why not ${shares(pv.qty)}?`}>
            <ReasonInput value={reason} onChange={setReason} />
          </Field>
          <div className="row gap">
            <button className="btn ghost grow" onClick={() => setDiff(false)}>
              Back
            </button>
            <button className="btn primary grow" disabled={!diffOk} onClick={() => confirm(other, reason)}>
              Log and check
            </button>
          </div>
        </div>
      )}

      {!priceOk && (
        <button className="btn ghost block" onClick={onClose}>
          Cancel
        </button>
      )}
    </Sheet>
  );
}

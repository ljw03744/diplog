import { useState } from 'react';
import { changeQty, deletePlan, setRemainderDone, stopPlan } from '../actions';
import { boughtQty, progress } from '../calc';
import { useNav } from '../nav';
import { useAppState } from '../store';
import { Empty, Field, NumInput, Page, ReasonSheet } from '../ui';
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
      <Page title="일정">
        <Empty>삭제된 일정입니다.</Empty>
      </Page>
    );

  const t = s.tickers.find((x) => x.id === plan.tickerId);
  const cur = t?.currency ?? 'USD';
  const pr = progress(plan);
  const isSplit = plan.ruleType === 'split';
  const logs = s.logs.filter((l) => l.planId === plan.id);
  const parsed = parseNum(qty);
  const qtyValid = Number.isInteger(parsed) && parsed > 0 && parsed !== plan.dailyQty;
  const statusText = plan.status === 'active' ? '진행 중' : plan.status === 'done' ? '완료' : '중단';

  return (
    <Page title={t?.symbol ?? '일정'} back="뒤로">
      <section className="card">
        <div className="row between">
          <b>{plan.ruleName}</b>
          <span className={'tag' + (plan.status === 'stopped' ? ' tag-warn' : '')}>{statusText}</span>
        </div>
        <dl className="facts">
          {plan.ruleType !== 'fixed' && (
            <>
              <dt>씨드</dt>
              <dd>{fmtMoney(plan.seed, plan.seedCurrency)}</dd>
              <dt>비중</dt>
              <dd>
                {plan.percent}% = {fmtMoney(plan.amount, cur)}
              </dd>
            </>
          )}
          {plan.price > 0 && (
            <>
              <dt>기준가</dt>
              <dd>{fmtMoney(plan.price, cur)}</dd>
            </>
          )}
          {plan.seedCurrency !== cur && plan.ruleType !== 'fixed' && (
            <>
              <dt>환율</dt>
              <dd>{plan.fxRate.toLocaleString('ko-KR')}원</dd>
            </>
          )}
          <dt>{isSplit ? '하루' : '한 번에'}</dt>
          <dd>{plan.dailyQty}주</dd>
          <dt>지금까지</dt>
          <dd>
            {boughtQty(plan)}주{isSplit && ` / ${plan.totalQty}주`} · {pr.done}회
          </dd>
          <dt>시작</dt>
          <dd>{fmtDate(plan.createdAt)}</dd>
          {plan.endedAt && (
            <>
              <dt>끝</dt>
              <dd>{fmtDate(plan.endedAt)}</dd>
            </>
          )}
        </dl>
      </section>

      <h3 className="section-title">회차</h3>
      <section className="card">
        {plan.entries.length === 0 && <div className="muted small">아직 매수한 날이 없습니다.</div>}
        <ol className="entries">
          {plan.entries.map((e) => (
            <li key={e.n} className={e.actualQty !== null ? 'done' : ''}>
              <span className="entry-n">{e.n}회차</span>
              <span className="entry-date">{e.date ? fmtDay(e.date) : '—'}</span>
              <span className="entry-qty">
                {e.actualQty !== null ? (
                  <>
                    {e.actualQty}주{e.actualQty !== e.plannedQty && <span className="warn-text"> / 계획 {e.plannedQty}</span>}
                  </>
                ) : (
                  <span className="muted">{e.plannedQty}주 예정</span>
                )}
              </span>
            </li>
          ))}
          {isSplit && plan.remainder > 0 && (
            <li className={plan.remainderDone ? 'done' : ''}>
              <span className="entry-n">짜투리</span>
              <span className="entry-date" />
              <label className="entry-qty">
                <input type="checkbox" checked={plan.remainderDone} onChange={(e) => setRemainderDone(plan.id, e.target.checked)} />{' '}
                {plan.remainder}주 (선택)
              </label>
            </li>
          )}
        </ol>
      </section>

      {plan.status === 'active' && (
        <div className="actions">
          <button className="btn ghost" onClick={() => setDialog('qty')}>
            수량 변경
          </button>
          <button className="btn ghost" onClick={() => setDialog('stop')}>
            {isSplit ? '중단' : '종료'}
          </button>
        </div>
      )}
      <div className="actions">
        <button className="btn ghost danger-text" onClick={() => setDialog('delete')}>
          일정 삭제
        </button>
      </div>

      {logs.length > 0 && (
        <>
          <h3 className="section-title">이 일정의 기록</h3>
          <div className="stack">
            {logs.map((l) => (
              <LogCard key={l.id} l={l} />
            ))}
          </div>
        </>
      )}

      {dialog === 'qty' && (
        <ReasonSheet
          title="수량 변경"
          description={`지금은 ${isSplit ? '하루' : '한 번에'} ${plan.dailyQty}주입니다.${isSplit ? ' 남은 회차에 적용됩니다.' : ''}`}
          confirmLabel="변경"
          extraValid={qtyValid}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => {
            changeQty(plan.id, parsed, reason);
            setDialog(null);
            setQty('');
          }}
        >
          <Field label="새 수량">
            <NumInput value={qty} onChange={setQty} suffix="주" decimal={false} />
          </Field>
        </ReasonSheet>
      )}
      {dialog === 'stop' && (
        <ReasonSheet
          title={isSplit ? '일정 중단' : '일정 종료'}
          description={isSplit ? `${pr.total}회 중 ${pr.done}회 매수했습니다. 남은 회차는 사지 않습니다.` : '더 이상 오늘 화면에 나오지 않습니다.'}
          confirmLabel={isSplit ? '중단' : '종료'}
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
          title="일정 삭제"
          description="일정은 지워지지만, 삭제했다는 기록과 이유는 남습니다."
          confirmLabel="삭제"
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

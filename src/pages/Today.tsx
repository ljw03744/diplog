import { useState } from 'react';
import { checkToday, uncheckToday } from '../actions';
import { boughtQty, progress, todayState } from '../calc';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { AppState, Plan } from '../types';
import { Empty, Field, NumInput, ReasonSheet, Segmented } from '../ui';
import { daysBetween, fmtDate, parseNum, todayStr } from '../util';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function TodayTab() {
  const s = useAppState();
  const [mode, setMode] = useState<'today' | 'ticker'>('today');
  const now = new Date();

  return (
    <div className="tab">
      <header className="tab-head">
        <div>
          <div className="eyebrow">
            {now.getMonth() + 1}월 {now.getDate()}일 {WEEK[now.getDay()]}요일
          </div>
          <h1>DipLog</h1>
        </div>
      </header>
      <BackupBanner s={s} />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'today', label: '오늘' },
          { value: 'ticker', label: '종목별' },
        ]}
      />
      {mode === 'today' ? <TodayList s={s} /> : <ByTicker s={s} />}
    </div>
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
      {days === null ? '아직 백업한 적이 없습니다.' : `마지막 백업이 ${days}일 전입니다.`} 설정에서 JSON으로 내보내 두세요.
    </div>
  );
}

function TodayList({ s }: { s: AppState }) {
  const today = todayStr();
  const active = s.plans.filter((p) => p.status === 'active');
  const doneToday = s.plans.filter((p) => p.status === 'done' && p.entries.some((e) => e.date === today));
  const list = [...active, ...doneToday];
  if (list.length === 0)
    return (
      <Empty>
        진행 중인 매수가 없습니다.
        <br />
        규칙 신호가 오면 ＋ 버튼으로 일정을 추가하세요.
      </Empty>
    );
  return (
    <div className="stack">
      {list.map((p) => (
        <TodayCard key={p.id} plan={p} s={s} today={today} />
      ))}
    </div>
  );
}

function TodayCard({ plan, s, today }: { plan: Plan; s: AppState; today: string }) {
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
    st.kind === 'todo' && st.entry ? `${st.entry.n}/${pr.total}회차` : isSplit ? `${pr.done}/${pr.total}회차` : `${pr.done}회 매수`;
  const parsed = parseNum(qty);
  const qtyValid = Number.isInteger(parsed) && parsed >= 0 && parsed !== plannedQty;

  return (
    <article className={'card today-card' + (doneEntry ? ' is-done' : '')}>
      <button className="card-main" onClick={() => nav.push({ name: 'plan', id: plan.id })}>
        <div className="card-title">
          <span className="symbol">{t?.symbol ?? '삭제된 종목'}</span>
          {t && <span className="tag">{t.account}</span>}
        </div>
        <div className="muted small">
          {plan.ruleName} · {stepLabel}
        </div>
      </button>

      {doneEntry ? (
        <div className="today-action">
          <div className="qty done">
            ✓ {doneEntry.actualQty}주{doneEntry.actualQty !== doneEntry.plannedQty && <span className="warn-text"> (계획 {doneEntry.plannedQty}주)</span>}
          </div>
          <button className="link small" onClick={() => uncheckToday(plan.id, today)}>
            잘못 눌렀어요
          </button>
        </div>
      ) : st.kind === 'todo' ? (
        <div className="today-action">
          <div className="qty">
            {!isSplit && <span className="muted small">조건 충족 시 </span>}
            {st.qty}주
          </div>
          <div className="row gap">
            <button className="link small" onClick={() => setDiffOpen(true)}>
              수량 다름
            </button>
            <button className="check" aria-label="계획대로 매수함" onClick={() => checkToday(plan.id, today, st.qty, null)}>
              매수함
            </button>
          </div>
        </div>
      ) : null}

      {isSplit && plan.remainder > 0 && plan.status === 'done' && !plan.remainderDone && (
        <div className="muted small">짜투리 {plan.remainder}주는 일정 상세에서 체크할 수 있습니다.</div>
      )}

      {diffOpen && (
        <ReasonSheet
          title="계획과 다른 수량"
          description={`계획은 ${plannedQty}주입니다. 실제로 산 수량과 이유를 적어 주세요.`}
          confirmLabel="기록하고 체크"
          extraValid={qtyValid}
          onClose={() => setDiffOpen(false)}
          onConfirm={(reason) => {
            checkToday(plan.id, today, parsed, reason);
            setDiffOpen(false);
            setQty('');
          }}
        >
          <Field label="실제 수량">
            <NumInput value={qty} onChange={setQty} suffix="주" decimal={false} />
          </Field>
        </ReasonSheet>
      )}
    </article>
  );
}

function ByTicker({ s }: { s: AppState }) {
  const nav = useNav();
  const groups = s.tickers
    .map((t) => ({ t, plans: s.plans.filter((p) => p.tickerId === t.id) }))
    .filter((g) => g.plans.length > 0);
  if (groups.length === 0) return <Empty>아직 만든 매매 일정이 없습니다.</Empty>;
  return (
    <div className="stack">
      {groups.map(({ t, plans }) => {
        const active = plans.filter((p) => p.status === 'active');
        const past = plans.filter((p) => p.status !== 'active');
        return (
          <section key={t.id} className="card">
            <div className="card-title">
              <span className="symbol">{t.symbol}</span>
              <span className="tag">{t.account}</span>
              <span className="muted small grow-right">{t.name}</span>
            </div>
            {active.length === 0 && <div className="muted small">진행 중인 일정 없음</div>}
            {active.map((p) => (
              <PlanRow key={p.id} p={p} onClick={() => nav.push({ name: 'plan', id: p.id })} />
            ))}
            {past.length > 0 && (
              <details className="past">
                <summary>지난 일정 {past.length}개</summary>
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
  const pct = pr.total ? (pr.done / pr.total) * 100 : null;
  const status = p.status === 'active' ? '' : p.status === 'done' ? '완료' : '중단';
  return (
    <button className="plan-row" onClick={onClick}>
      <div className="row between">
        <span>{p.ruleName}</span>
        <span className="muted small">
          {status && <span className={'tag ' + (p.status === 'stopped' ? 'tag-warn' : '')}>{status}</span>} {boughtQty(p)}주 · {fmtDate(p.createdAt)}
        </span>
      </div>
      {pct !== null && (
        <div className="bar">
          <div style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  );
}

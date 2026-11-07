import { useState } from 'react';
import {
  addOffRule,
  addSaving,
  deleteRule,
  deleteSaving,
  deleteTicker,
  MIN_REASON,
  saveCommonChecks,
  saveRule,
  saveTicker,
  setSavingsTarget,
} from '../actions';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { Account, Currency, Rule, RuleGroup, RuleType, TickerGroup } from '../types';
import { ConfirmSheet, Empty, Field, NumInput, Page, ReasonInput, ReasonSheet, Segmented } from '../ui';
import { fmtDay, parseNum, todayStr, uid } from '../util';
import { ruleText } from './NewPlan';

const TICKER_GROUPS: TickerGroup[] = ['나스닥', '반도체', '개별', '채권'];
const RULE_GROUPS: RuleGroup[] = ['나스닥', '반도체', '개별', '공통'];

/* ───────── 종목 ───────── */

export function TickersPage() {
  const s = useAppState();
  const nav = useNav();
  return (
    <Page title="종목" back="뒤로" right={<button className="link" onClick={() => nav.push({ name: 'tickerForm' })}>추가</button>}>
      <nav className="menu card">
        {s.tickers.map((t) => (
          <button key={t.id} onClick={() => nav.push({ name: 'tickerForm', id: t.id })}>
            <span>
              <b>{t.symbol}</b> <span className="muted small">{t.name}</span>
            </span>
            <span className="muted small">
              {t.group} · {t.account} ›
            </span>
          </button>
        ))}
      </nav>
    </Page>
  );
}

export function TickerFormPage({ id }: { id?: string }) {
  const s = useAppState();
  const nav = useNav();
  const old = s.tickers.find((t) => t.id === id);
  const [symbol, setSymbol] = useState(old?.symbol ?? '');
  const [name, setName] = useState(old?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(old?.currency ?? 'USD');
  const [account, setAccount] = useState<Account>(old?.account ?? '직투');
  const [group, setGroup] = useState<TickerGroup>(old?.group ?? '나스닥');
  const used = !!old && s.plans.some((p) => p.tickerId === old.id);
  const [ask, setAsk] = useState(false);

  function save() {
    saveTicker({ id: old?.id ?? uid(), symbol: symbol.trim(), name: name.trim(), currency, account, group });
    nav.pop();
  }

  return (
    <Page title={old ? '종목 수정' : '종목 추가'} back="취소">
      <Field label="티커 / 이름">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="QLD" autoCapitalize="characters" />
      </Field>
      <Field label="설명 (선택)">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="나스닥100 2배" />
      </Field>
      <Field label="그룹" hint="그룹에 맞는 매수 규칙이 연결됩니다.">
        <Segmented value={group} onChange={setGroup} options={TICKER_GROUPS.map((g) => ({ value: g, label: g }))} />
      </Field>
      <Field label="통화">
        <Segmented
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'USD', label: '달러' },
            { value: 'KRW', label: '원화' },
          ]}
        />
      </Field>
      <Field label="계좌">
        <Segmented
          value={account}
          onChange={setAccount}
          options={[
            { value: '직투', label: '직투' },
            { value: 'ISA', label: 'ISA' },
          ]}
        />
      </Field>
      <button className="btn primary block" disabled={!symbol.trim()} onClick={save}>
        저장
      </button>
      {old && (
        <button className="btn ghost danger-text block" onClick={() => setAsk(true)}>
          종목 삭제
        </button>
      )}
      {old && ask && used && (
        <ConfirmSheet
          title="삭제할 수 없습니다"
          description={`${old.symbol}으로 만든 일정이 있습니다. 지난 일정까지 남아 있어야 기록이 맞게 보입니다.`}
          onClose={() => setAsk(false)}
        />
      )}
      {old && ask && !used && (
        <ConfirmSheet
          title={`${old.symbol} 종목 삭제`}
          description="이 종목으로 만든 일정이 없어서 바로 지워집니다."
          confirmLabel="삭제"
          danger
          onClose={() => setAsk(false)}
          onConfirm={() => {
            deleteTicker(old.id);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

/* ───────── 규칙 ───────── */

export function RulesPage() {
  const s = useAppState();
  const nav = useNav();
  const [editChecks, setEditChecks] = useState(false);
  const [checksText, setChecksText] = useState('');

  return (
    <Page title="매수 규칙" back="뒤로" right={<button className="link" onClick={() => nav.push({ name: 'ruleForm' })}>추가</button>}>
      <p className="muted small">규칙을 고치거나 지우려면 이유를 적어야 하고, 기록에 남습니다.</p>
      {RULE_GROUPS.map((g) => {
        const rules = s.rules.filter((r) => r.group === g);
        if (rules.length === 0) return null;
        return (
          <section key={g}>
            <h3 className="section-title">{g}</h3>
            <nav className="menu card">
              {rules.map((r) => (
                <button key={r.id} onClick={() => nav.push({ name: 'ruleForm', id: r.id })}>
                  <span>{r.name}</span>
                  <span className="muted small">{ruleText(r)} ›</span>
                </button>
              ))}
            </nav>
          </section>
        );
      })}

      <h3 className="section-title">공통 규칙 (일정 시작 전 체크)</h3>
      <section className="card">
        <ul className="plain">
          {s.commonChecks.map((c, i) => (
            <li key={i}>☐ {c}</li>
          ))}
        </ul>
        <button
          className="btn ghost"
          onClick={() => {
            setChecksText(s.commonChecks.join('\n'));
            setEditChecks(true);
          }}
        >
          체크리스트 수정
        </button>
      </section>

      {editChecks && (
        <ReasonSheet
          title="공통 규칙 수정"
          description="한 줄에 하나씩 적어 주세요."
          confirmLabel="저장"
          onClose={() => setEditChecks(false)}
          onConfirm={(reason) => {
            saveCommonChecks(
              checksText
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
              reason,
            );
            setEditChecks(false);
          }}
        >
          <textarea className="block" rows={6} value={checksText} onChange={(e) => setChecksText(e.target.value)} />
        </ReasonSheet>
      )}
    </Page>
  );
}

export function RuleFormPage({ id }: { id?: string }) {
  const s = useAppState();
  const nav = useNav();
  const old = s.rules.find((r) => r.id === id);
  const [name, setName] = useState(old?.name ?? '');
  const [group, setGroup] = useState<RuleGroup>(old?.group ?? '나스닥');
  const [type, setType] = useState<RuleType>(old?.type ?? 'split');
  const [percent, setPercent] = useState(old ? String(old.percent) : '');
  const [days, setDays] = useState(old ? String(old.days || 5) : '5');
  const [shares, setShares] = useState(old ? String(old.sharesPerDay || 1) : '1');
  const [note, setNote] = useState(old?.note ?? '');
  const [sheet, setSheet] = useState<'save' | 'delete' | null>(null);

  const draft: Rule = {
    id: old?.id ?? uid(),
    name: name.trim(),
    group,
    type,
    percent: type === 'fixed' ? 0 : parseNum(percent),
    days: type === 'split' ? Math.floor(parseNum(days)) : 0,
    sharesPerDay: type === 'fixed' ? Math.floor(parseNum(shares)) : 0,
    note: note.trim(),
  };
  const valid =
    !!draft.name &&
    (type === 'fixed' ? draft.sharesPerDay > 0 : draft.percent > 0 && draft.percent <= 100) &&
    (type !== 'split' || draft.days >= 1);

  function onSave() {
    if (old) setSheet('save');
    else {
      saveRule(draft, null);
      nav.pop();
    }
  }

  return (
    <Page title={old ? '규칙 수정' : '규칙 추가'} back="취소">
      <Field label="이름">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="100일선 터치" />
      </Field>
      <Field label="그룹" hint="'공통'은 모든 종목에서 고를 수 있습니다.">
        <Segmented value={group} onChange={setGroup} options={RULE_GROUPS.map((g) => ({ value: g, label: g }))} />
      </Field>
      <Field label="방식">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'split', label: '기간 분할' },
            { value: 'signal', label: '신호마다 %' },
            { value: 'fixed', label: '신호마다 N주' },
          ]}
        />
      </Field>
      {type !== 'fixed' && (
        <Field label="씨드 대비 비중">
          <NumInput value={percent} onChange={setPercent} suffix="%" />
        </Field>
      )}
      {type === 'split' && (
        <Field label="나눠 사는 기간" hint={valid ? ruleText(draft) : undefined}>
          <NumInput value={days} onChange={setDays} suffix="일" decimal={false} />
        </Field>
      )}
      {type === 'fixed' && (
        <Field label="한 번에 사는 수량">
          <NumInput value={shares} onChange={setShares} suffix="주" decimal={false} />
        </Field>
      )}
      <Field label="메모 · 전제 조건 (선택)">
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="btn primary block" disabled={!valid} onClick={onSave}>
        저장
      </button>
      {old && (
        <button className="btn ghost danger-text block" onClick={() => setSheet('delete')}>
          규칙 삭제
        </button>
      )}
      {sheet === 'save' && (
        <ReasonSheet
          title="규칙 수정"
          description="이미 시작한 일정에는 영향이 없습니다."
          confirmLabel="저장"
          onClose={() => setSheet(null)}
          onConfirm={(reason) => {
            saveRule(draft, reason);
            nav.pop();
          }}
        />
      )}
      {sheet === 'delete' && (
        <ReasonSheet
          title="규칙 삭제"
          confirmLabel="삭제"
          danger
          onClose={() => setSheet(null)}
          onConfirm={(reason) => {
            deleteRule(old!.id, reason);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

/* ───────── 규칙 외 매수 ───────── */

export function OffRulePage() {
  const s = useAppState();
  const nav = useNav();
  const [tid, setTid] = useState<string | undefined>();
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const t = s.tickers.find((x) => x.id === tid);
  const q = parseNum(qty);
  const ok = !!t && Number.isInteger(q) && q > 0 && reason.trim().length >= MIN_REASON;

  return (
    <Page title="규칙 외 매수" back="취소">
      <p className="muted small">
        규칙에 없는 매수도 숨기지 말고 남겨 두세요. 준수율에 반영되고, 나중에 이 이유들을 다시 읽게 됩니다.
      </p>
      <Field label="종목">
        <div className="chips">
          {s.tickers.map((x) => (
            <button key={x.id} className={'chip' + (x.id === tid ? ' on' : '')} onClick={() => setTid(x.id)}>
              {x.symbol}
            </button>
          ))}
        </div>
      </Field>
      <Field label="수량">
        <NumInput value={qty} onChange={setQty} suffix="주" decimal={false} />
      </Field>
      <Field label="체결가 (선택)">
        <NumInput value={price} onChange={setPrice} suffix={t?.currency === 'KRW' ? '원' : '$'} />
      </Field>
      <Field label="이유">
        <ReasonInput value={reason} onChange={setReason} placeholder="왜 규칙 밖에서 샀나요?" />
      </Field>
      <button
        className="btn danger block"
        disabled={!ok}
        onClick={() => {
          const p = parseNum(price);
          addOffRule(t!.symbol, q, p > 0 ? p : null, t!.currency, reason);
          nav.pop();
        }}
      >
        기록하기
      </button>
    </Page>
  );
}

/* ───────── 적립 (BOXX) ───────── */

export function SavingsPage() {
  const s = useAppState();
  const symbol = s.settings.savingsSymbol;
  const [date, setDate] = useState(todayStr());
  const [qty, setQty] = useState('3');
  const [krw, setKrw] = useState('');
  const [target, setTarget] = useState(String(s.settings.savingsTarget));
  const [delId, setDelId] = useState<string | null>(null);
  const total = s.savings.reduce((a, x) => a + x.qty, 0);
  const totalKrw = s.savings.reduce((a, x) => a + x.krw, 0);
  const goal = s.settings.savingsTarget;
  const q = parseNum(qty);

  return (
    <Page title={`${symbol} 적립`} back="뒤로">
      <section className="card">
        <div className="row between">
          <span className="stat-v">
            {total}
            <span className="muted small"> / {goal}주</span>
          </span>
          <span className="muted small">{totalKrw.toLocaleString('ko-KR')}원</span>
        </div>
        <div className="bar">
          <div style={{ width: `${Math.min(100, goal ? (total / goal) * 100 : 0)}%` }} />
        </div>
        <p className="muted small">
          일반 매수에 쓰지 않는 돈. 최소 100주선(가능하면 200주선) 터치 때만 사용하고, 쓴 뒤에는 리밸런싱으로 다시 채운다.
        </p>
      </section>

      <h3 className="section-title">적립 기록 추가</h3>
      <section className="card">
        <Field label="날짜">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="row gap">
          <Field label="수량">
            <NumInput value={qty} onChange={setQty} suffix="주" decimal={false} />
          </Field>
          <Field label="원화 금액 (선택)">
            <NumInput value={krw} onChange={setKrw} suffix="원" />
          </Field>
        </div>
        <button
          className="btn primary block"
          disabled={!(Number.isInteger(q) && q > 0) || !date}
          onClick={() => {
            addSaving({ date, symbol, qty: q, krw: parseNum(krw) || 0 });
            setKrw('');
          }}
        >
          추가
        </button>
      </section>

      <h3 className="section-title">내역</h3>
      {s.savings.length === 0 ? (
        <Empty>아직 적립 기록이 없습니다.</Empty>
      ) : (
        <nav className="menu card">
          {[...s.savings]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((x) => (
              <div key={x.id} className="menu-row">
                <span>
                  {fmtDay(x.date)} <span className="muted small">{x.date.slice(0, 4)}</span>
                </span>
                <span>
                  {x.qty}주 {x.krw > 0 && <span className="muted small">{x.krw.toLocaleString('ko-KR')}원</span>}{' '}
                  <button className="link small danger-text" onClick={() => setDelId(x.id)}>
                    삭제
                  </button>
                </span>
              </div>
            ))}
        </nav>
      )}

      <h3 className="section-title">목표</h3>
      <section className="card row gap">
        <NumInput value={target} onChange={setTarget} suffix="주" decimal={false} />
        <button
          className="btn ghost"
          disabled={!(parseNum(target) > 0) || parseNum(target) === goal}
          onClick={() => setSavingsTarget(Math.floor(parseNum(target)))}
        >
          저장
        </button>
      </section>

      {delId && (
        <ConfirmSheet
          title="적립 기록 삭제"
          description="이 적립 기록을 지울까요?"
          confirmLabel="삭제"
          danger
          onClose={() => setDelId(null)}
          onConfirm={() => {
            deleteSaving(delId);
            setDelId(null);
          }}
        />
      )}
    </Page>
  );
}

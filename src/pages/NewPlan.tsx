import { useMemo, useState } from 'react';
import { createPlan, MIN_REASON, planLabel } from '../actions';
import { calcPlan } from '../calc';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { Currency, Rule } from '../types';
import { Field, NumInput, Page, ReasonInput, Segmented } from '../ui';
import { fmtMoney, parseNum } from '../util';

export function ruleText(r: Pick<Rule, 'type' | 'percent' | 'days' | 'sharesPerDay'>): string {
  if (r.type === 'split') return r.days > 1 ? `${r.percent}% · ${r.days}일 분할 (하루 ${+(r.percent / r.days).toFixed(2)}%)` : `${r.percent}% · 하루`;
  if (r.type === 'signal') return `조건 충족마다 ${r.percent}%`;
  return `조건 충족마다 ${r.sharesPerDay}주`;
}

export function NewPlanPage({ tickerId }: { tickerId?: string }) {
  const s = useAppState();
  const nav = useNav();
  const [tid, setTid] = useState<string | undefined>(tickerId);
  const [rid, setRid] = useState<string | undefined>();
  const [seed, setSeed] = useState('');
  const [seedCur, setSeedCur] = useState<Currency>('USD');
  const [price, setPrice] = useState('');
  const [fx, setFx] = useState('');
  const [checks, setChecks] = useState<boolean[]>([]);
  const [concurrent, setConcurrent] = useState('');

  const ticker = s.tickers.find((t) => t.id === tid);
  const rules = ticker ? s.rules.filter((r) => r.group === ticker.group || r.group === '공통') : [];
  const rule = rules.find((r) => r.id === rid);
  const active = s.plans.filter((p) => p.status === 'active');
  const needFx = !!ticker && !!rule && rule.type !== 'fixed' && seedCur !== ticker.currency;

  const result = useMemo(() => {
    if (!ticker || !rule) return null;
    return calcPlan({
      type: rule.type,
      seed: parseNum(seed),
      seedCurrency: seedCur,
      tickerCurrency: ticker.currency,
      fxRate: parseNum(fx),
      price: parseNum(price),
      percent: rule.percent,
      days: rule.days,
      sharesPerDay: rule.sharesPerDay,
    });
  }, [ticker, rule, seed, seedCur, fx, price]);

  const allChecked = s.commonChecks.every((_, i) => checks[i]);
  const concurrentOk = active.length === 0 || concurrent.trim().length >= MIN_REASON;
  const canStart = !!ticker && !!rule && !!result && !result.problem && allChecked && concurrentOk;

  function pickTicker(id: string) {
    setTid(id);
    setRid(undefined);
    const t = s.tickers.find((x) => x.id === id);
    if (t) setSeedCur(t.currency);
  }

  function start() {
    if (!canStart || !ticker || !rule) return;
    createPlan({
      ticker,
      rule,
      seed: rule.type === 'fixed' ? 0 : parseNum(seed),
      seedCurrency: seedCur,
      fxRate: parseNum(fx),
      price: parseNum(price) || 0,
      concurrentReason: active.length > 0 ? concurrent : null,
    });
    nav.reset();
  }

  return (
    <Page title="매매 일정 추가" back="취소">
      <section className="step">
        <h2>
          <span className="step-n">1</span>종목
        </h2>
        <div className="chips">
          {s.tickers
            .filter((t) => t.group !== '채권')
            .map((t) => (
              <button key={t.id} className={'chip' + (t.id === tid ? ' on' : '')} onClick={() => pickTicker(t.id)}>
                {t.symbol}
                <span className="chip-sub">{t.group}</span>
              </button>
            ))}
          <button className="chip add" onClick={() => nav.push({ name: 'tickerForm' })}>
            ＋ 종목 추가
          </button>
        </div>
      </section>

      {ticker && (
        <section className="step">
          <h2>
            <span className="step-n">2</span>매수 근거
          </h2>
          <div className="rule-list">
            {rules.map((r) => (
              <button key={r.id} className={'rule-opt' + (r.id === rid ? ' on' : '')} onClick={() => setRid(r.id)}>
                <span className="rule-name">{r.name}</span>
                <span className="muted small">{ruleText(r)}</span>
              </button>
            ))}
            {rules.length === 0 && <div className="muted small">이 종목 그룹({ticker.group})에 맞는 규칙이 없습니다. 설정 → 규칙에서 추가하세요.</div>}
          </div>
          {rule?.note && <p className="note">{rule.note}</p>}
        </section>
      )}

      {ticker && rule && rule.type !== 'fixed' && (
        <section className="step">
          <h2>
            <span className="step-n">3</span>씨드와 현재가
          </h2>
          <Field label="씨드 (지금 쓸 수 있는 현금)">
            <div className="row gap">
              <NumInput value={seed} onChange={setSeed} placeholder="0" />
              <Segmented
                value={seedCur}
                onChange={setSeedCur}
                options={[
                  { value: 'USD', label: '$' },
                  { value: 'KRW', label: '원' },
                ]}
              />
            </div>
          </Field>
          {needFx && (
            <Field label="환율 (1달러 = ?원)">
              <NumInput value={fx} onChange={setFx} placeholder="1,400" suffix="원" />
            </Field>
          )}
          <Field label={`${ticker.symbol} 현재가`}>
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={ticker.currency === 'USD' ? '$' : '원'} />
          </Field>
        </section>
      )}

      {ticker && rule && rule.type === 'fixed' && (
        <section className="step">
          <h2>
            <span className="step-n">3</span>현재가 (선택)
          </h2>
          <Field label={`${ticker.symbol} 현재가`} hint="수량이 정해진 규칙이라 씨드는 필요 없습니다.">
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={ticker.currency === 'USD' ? '$' : '원'} />
          </Field>
        </section>
      )}

      {ticker && rule && result && (
        <section className={'result' + (result.problem ? ' bad' : '')}>
          {result.problem ? (
            <p>{result.problem}</p>
          ) : rule.type === 'split' ? (
            <>
              <div className="result-main">
                하루 <b>{result.dailyQty}주</b> × {Math.max(1, rule.days)}일
              </div>
              <div className="result-sub">
                총 {result.totalQty}주{result.remainder > 0 && <> · 짜투리 {result.remainder}주 (따로)</>}
              </div>
              <div className="result-sub muted">
                {rule.percent}% = {fmtMoney(result.amount, ticker.currency)}
                {needFx && ` (${fmtMoney(convertBack(result.amount, ticker.currency, parseNum(fx)), seedCur)})`}
              </div>
            </>
          ) : (
            <>
              <div className="result-main">
                조건 충족한 날마다 <b>{result.dailyQty}주</b>
              </div>
              {rule.type === 'signal' && (
                <div className="result-sub muted">
                  {rule.percent}% = {fmtMoney(result.amount, ticker.currency)}
                </div>
              )}
              <div className="result-sub muted">끝나는 날이 없습니다. 직접 종료할 때까지 오늘 화면에 남습니다.</div>
            </>
          )}
        </section>
      )}

      {ticker && rule && result && !result.problem && (
        <section className="step">
          <h2>
            <span className="step-n">4</span>공통 규칙 확인
          </h2>
          <div className="checks">
            {s.commonChecks.map((c, i) => (
              <label key={i} className="check-row">
                <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks((v) => Object.assign([...v], { [i]: e.target.checked }))} />
                <span>{c}</span>
              </label>
            ))}
          </div>
          {active.length > 0 && (
            <div className="warn-box">
              <b>진행 중인 매수가 있습니다.</b>
              <ul>
                {active.map((p) => (
                  <li key={p.id}>{planLabel(p, s)}</li>
                ))}
              </ul>
              <p className="small">규칙: 하나의 매수가 진행 중일 때 다른 매수를 추가로 진행하지 않음. 그래도 시작하려면 이유를 적어 주세요.</p>
              <ReasonInput value={concurrent} onChange={setConcurrent} />
            </div>
          )}
        </section>
      )}

      <div className="sticky-foot">
        <button className="btn primary block" disabled={!canStart} onClick={start}>
          일정 시작
        </button>
      </div>
    </Page>
  );
}

function convertBack(amount: number, tickerCur: Currency, fx: number): number {
  return tickerCur === 'USD' ? amount * fx : amount / fx;
}

import { useMemo, useState } from 'react';
import { createPlan, MIN_REASON, planLabel } from '../actions';
import { calcPlan } from '../calc';
import { groupLabel, shares } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { Currency, Rule } from '../types';
import { Field, NumInput, Page, ReasonInput, Segmented } from '../ui';
import { fmtMoney, parseNum } from '../util';

export function ruleText(r: Pick<Rule, 'type' | 'percent' | 'days' | 'sharesPerDay'>): string {
  if (r.type === 'split') return r.days > 1 ? `${r.percent}% over ${r.days} days (${+(r.percent / r.days).toFixed(2)}%/day)` : `${r.percent}% in 1 day`;
  if (r.type === 'signal') return `${r.percent}% per signal`;
  return `${shares(r.sharesPerDay)} per signal`;
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

  const priceSuffix = ticker?.currency === 'USD' ? '$' : '₩';

  return (
    <Page title="New buy plan" back="Cancel">
      <section className="step">
        <h2>
          <span className="step-n">1</span>Ticker
        </h2>
        <div className="chips">
          {s.tickers
            .filter((t) => t.group !== '채권')
            .map((t) => (
              <button key={t.id} className={'chip' + (t.id === tid ? ' on' : '')} onClick={() => pickTicker(t.id)}>
                {t.symbol}
                <span className="chip-sub">{groupLabel(t.group)}</span>
              </button>
            ))}
          <button className="chip add" onClick={() => nav.push({ name: 'tickerForm' })}>
            ＋ Add ticker
          </button>
        </div>
      </section>

      {ticker && (
        <section className="step">
          <h2>
            <span className="step-n">2</span>Buy signal
          </h2>
          <div className="rule-list">
            {rules.map((r) => (
              <button key={r.id} className={'rule-opt' + (r.id === rid ? ' on' : '')} onClick={() => setRid(r.id)}>
                <span className="rule-name">{r.name}</span>
                <span className="muted small">{ruleText(r)}</span>
              </button>
            ))}
            {rules.length === 0 && (
              <div className="muted small">No rules for this group ({groupLabel(ticker.group)}). Add one in Settings → Rules.</div>
            )}
          </div>
          {rule?.note && <p className="note">{rule.note}</p>}
        </section>
      )}

      {ticker && rule && rule.type !== 'fixed' && (
        <section className="step">
          <h2>
            <span className="step-n">3</span>Seed and price
          </h2>
          <Field label="Seed (cash you can use now)">
            <div className="row gap">
              <NumInput value={seed} onChange={setSeed} placeholder="0" />
              <Segmented
                value={seedCur}
                onChange={setSeedCur}
                options={[
                  { value: 'USD', label: '$' },
                  { value: 'KRW', label: '₩' },
                ]}
              />
            </div>
          </Field>
          {needFx && (
            <Field label="Exchange rate (₩ per $1)">
              <NumInput value={fx} onChange={setFx} placeholder="1,400" suffix="₩" />
            </Field>
          )}
          <Field label={`${ticker.symbol} current price`}>
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={priceSuffix} />
          </Field>
        </section>
      )}

      {ticker && rule && rule.type === 'fixed' && (
        <section className="step">
          <h2>
            <span className="step-n">3</span>Current price (optional)
          </h2>
          <Field label={`${ticker.symbol} current price`} hint="This rule has a fixed share count, so no seed is needed.">
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={priceSuffix} />
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
                <b>{shares(result.dailyQty)}</b> a day × {Math.max(1, rule.days)} {Math.max(1, rule.days) === 1 ? 'day' : 'days'}
              </div>
              <div className="result-sub">
                {shares(result.totalQty)} in total{result.remainder > 0 && <> · {result.remainder} left over (separate)</>}
              </div>
              <div className="result-sub muted">
                {rule.percent}% = {fmtMoney(result.amount, ticker.currency)}
                {needFx && ` (${fmtMoney(convertBack(result.amount, ticker.currency, parseNum(fx)), seedCur)})`}
              </div>
            </>
          ) : (
            <>
              <div className="result-main">
                <b>{shares(result.dailyQty)}</b> on each signal day
              </div>
              {rule.type === 'signal' && (
                <div className="result-sub muted">
                  {rule.percent}% = {fmtMoney(result.amount, ticker.currency)}
                </div>
              )}
              <div className="result-sub muted">No end date. It stays on Today until you end it.</div>
            </>
          )}
        </section>
      )}

      {ticker && rule && result && !result.problem && (
        <section className="step">
          <h2>
            <span className="step-n">4</span>Check the common rules
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
              <b>Another buy is in progress.</b>
              <ul>
                {active.map((p) => (
                  <li key={p.id}>{planLabel(p, s)}</li>
                ))}
              </ul>
              <p className="small">Rule: don't start another buy while one is in progress. To start anyway, write down why.</p>
              <ReasonInput value={concurrent} onChange={setConcurrent} />
            </div>
          )}
        </section>
      )}

      <div className="sticky-foot">
        <button className="btn primary block" disabled={!canStart} onClick={start}>
          Start plan
        </button>
      </div>
    </Page>
  );
}

function convertBack(amount: number, tickerCur: Currency, fx: number): number {
  return tickerCur === 'USD' ? amount * fx : amount / fx;
}

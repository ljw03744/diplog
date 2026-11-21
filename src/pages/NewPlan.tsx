import { useMemo, useState } from 'react';
import { createPlan, MIN_REASON, planLabel } from '../actions';
import { accountCurrency, calcBudget, calcPlan, ruleApplies } from '../calc';
import { accountLabel, groupLabel, shares } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { AppState, Currency, Rule, RuleGroup, Ticker } from '../types';
import { Field, NumInput, Page, ReasonInput, Segmented } from '../ui';
import { daysBetween, fmtMoney, parseNum } from '../util';

/** 비중 %의 기준이 되는 현금. 그 계좌의 지금 현금 잔고로 채운다 */
function initialCash(s: AppState, t: Ticker | undefined): { value: string; cur: Currency } {
  if (!t) return { value: '', cur: 'USD' };
  const cash = s.cash[t.account];
  const cur = accountCurrency(t.account);
  const value = cash !== null && cash > 0 ? cash.toLocaleString('en-US', { maximumFractionDigits: cur === 'KRW' ? 0 : 2 }) : '';
  return { value, cur };
}

/** 그룹 순서 → 그룹 안 순서대로 */
export function orderRules(rules: Rule[], order: RuleGroup[]): Rule[] {
  const rank = (g: RuleGroup) => {
    const k = order.indexOf(g);
    return k < 0 ? order.length : k;
  };
  return rules.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.group) - rank(b.r.group) || a.i - b.i).map((x) => x.r);
}

export function ruleText(r: Pick<Rule, 'type' | 'percent' | 'days' | 'sharesPerDay'>): string {
  if (r.type === 'split') return r.days > 1 ? `${r.percent}% over ${r.days} days (${+(r.percent / r.days).toFixed(2)}%/day)` : `${r.percent}% in 1 day`;
  if (r.type === 'signal') return `${r.percent}% per signal`;
  return `${shares(r.sharesPerDay)} per signal`;
}

export function NewPlanPage({ tickerId }: { tickerId?: string }) {
  const s = useAppState();
  const nav = useNav();
  const first = initialCash(
    s,
    s.tickers.find((t) => t.id === tickerId),
  );
  const [tid, setTid] = useState<string | undefined>(tickerId);
  const [rid, setRid] = useState<string | undefined>();
  // 내부 이름은 예전 데이터와 맞추려고 seed로 두지만, 화면에서는 '현금(Cash)'
  const [seed, setSeed] = useState(first.value);
  const [seedCur, setSeedCur] = useState<Currency>(first.cur);
  const [price, setPrice] = useState('');
  const [fx, setFx] = useState('');
  const [checks, setChecks] = useState<boolean[]>([]);
  const [concurrent, setConcurrent] = useState('');

  const ticker = s.tickers.find((t) => t.id === tid);
  const rules = ticker
    ? orderRules(
        s.rules.filter((r) => ruleApplies(r.group, ticker.group)),
        s.settings.ruleGroupOrder,
      )
    : [];
  const rule = rules.find((r) => r.id === rid);
  const active = s.plans.filter((p) => p.status === 'active');
  const needFx = !!ticker && !!rule && rule.type !== 'fixed' && seedCur !== ticker.currency;
  const cash = ticker ? s.cash[ticker.account] : null;
  const cashAge = s.cash.updatedAt ? daysBetween(s.cash.updatedAt) : null;

  const result = useMemo(() => {
    if (!ticker || !rule) return null;
    if (rule.type === 'fixed') {
      const c = calcPlan({
        type: 'fixed',
        seed: 0,
        seedCurrency: seedCur,
        tickerCurrency: ticker.currency,
        fxRate: parseNum(fx),
        price: parseNum(price),
        percent: 0,
        days: 0,
        sharesPerDay: rule.sharesPerDay,
      });
      return { kind: 'fixed' as const, qty: c.dailyQty, problem: c.problem };
    }
    const b = calcBudget({
      type: rule.type,
      seed: parseNum(seed),
      seedCurrency: seedCur,
      tickerCurrency: ticker.currency,
      fxRate: parseNum(fx),
      percent: rule.percent,
      days: rule.days,
    });
    return { kind: 'amount' as const, ...b };
  }, [ticker, rule, seed, seedCur, fx, price]);

  const allChecked = s.commonChecks.every((_, i) => checks[i]);
  const concurrentOk = active.length === 0 || concurrent.trim().length >= MIN_REASON;
  const canStart = !!ticker && !!rule && !!result && !result.problem && allChecked && concurrentOk;
  const p = parseNum(price);
  const estQty = result?.kind === 'amount' && p > 0 ? Math.floor(result.perRound / p + 1e-9) : null;

  function pickTicker(id: string) {
    setTid(id);
    setRid(undefined);
    const v = initialCash(
      s,
      s.tickers.find((x) => x.id === id),
    );
    setSeed(v.value);
    setSeedCur(v.cur);
  }

  function start() {
    if (!canStart || !ticker || !rule) return;
    createPlan({
      ticker,
      rule,
      seed: rule.type === 'fixed' ? 0 : parseNum(seed),
      seedCurrency: seedCur,
      fxRate: parseNum(fx),
      price: p > 0 ? p : 0,
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
            <span className="step-n">3</span>Cash
          </h2>
          <Field
            label={`${accountLabel(ticker.account)} cash`}
            hint={
              cash !== null
                ? `Your ${accountLabel(ticker.account)} cash balance${cashAge !== null ? ` (matched ${cashAge === 0 ? 'today' : `${cashAge}d ago`})` : ''}. The % in the rule is taken from this. Change it if needed.`
                : `Enter your ${accountLabel(ticker.account)} cash on Today and this fills in by itself.`
            }
          >
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
          <Field
            label={`${ticker.symbol} current price (optional)`}
            hint="Only for a preview. On each buy day you enter the current price and DipLog works out the shares."
          >
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={priceSuffix} />
          </Field>
        </section>
      )}

      {ticker && rule && rule.type === 'fixed' && (
        <section className="step">
          <h2>
            <span className="step-n">3</span>Current price (optional)
          </h2>
          <Field label={`${ticker.symbol} current price`} hint="This rule has a fixed share count, so no cash amount is needed.">
            <NumInput value={price} onChange={setPrice} placeholder="0" suffix={priceSuffix} />
          </Field>
        </section>
      )}

      {ticker && rule && result && (
        <section className={'result' + (result.problem ? ' bad' : '')}>
          {result.problem ? (
            <p>{result.problem}</p>
          ) : result.kind === 'fixed' ? (
            <>
              <div className="result-main">
                <b>{shares(result.qty)}</b> on each signal day
              </div>
              <div className="result-sub muted">No end date. It stays on Today until you end it.</div>
            </>
          ) : rule.type === 'split' ? (
            <>
              <div className="result-main">
                <b>{fmtMoney(result.perRound, ticker.currency)}</b> a day × {result.rounds} {result.rounds === 1 ? 'day' : 'days'}
              </div>
              <div className="result-sub">
                {rule.percent}% = {fmtMoney(result.amount, ticker.currency)} in total
                {needFx && ` (${fmtMoney(convertBack(result.amount, ticker.currency, parseNum(fx)), seedCur)})`}
              </div>
              {estQty !== null && <div className="result-sub muted">At {fmtMoney(p, ticker.currency)} that's about {shares(estQty)} a day.</div>}
              <div className="result-sub muted">Shares are worked out each day from the current price. Spending more or less one day evens out over the rest.</div>
            </>
          ) : (
            <>
              <div className="result-main">
                <b>{fmtMoney(result.perRound, ticker.currency)}</b> on the first signal day
              </div>
              <div className="result-sub">{rule.percent}% of your cash balance, worked out again at every buy</div>
              {estQty !== null && <div className="result-sub muted">At {fmtMoney(p, ticker.currency)} that's about {shares(estQty)}.</div>}
              <div className="result-sub muted">
                As your cash goes down, each buy gets a little smaller (e.g. ₩1,000,000 → ₩30,000, then ₩970,000 → ₩29,000). No end date: it stays on
                Today until you end it.
              </div>
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

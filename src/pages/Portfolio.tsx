import { useState } from 'react';
import { updateFx } from '../actions';
import { accountLabel, shares } from '../labels';
import { useNav } from '../nav';
import { toKrw, trades, weights, type Slice, type Trade } from '../portfolio';
import { useAppState } from '../store';
import type { AppState } from '../types';
import { Empty, Field, Logo, NumInput, Sheet } from '../ui';
import { daysBetween, fmtDay, fmtKst, fmtMoney, KST, parseNum, ymdIn } from '../util';
import { CASH_REFRESH_DAYS } from './Cash';

/** 환율도 현금처럼 2주마다 최신화를 권한다 */
export function fxIsStale(s: AppState): boolean {
  return !s.fx.updatedAt || daysBetween(s.fx.updatedAt) >= CASH_REFRESH_DAYS;
}

function ago(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export function PortfolioTab() {
  const s = useAppState();
  const list = trades(s);
  const w = weights(s, list);

  return (
    <div className="tab">
      <header className="tab-head">
        <h1>Portfolio</h1>
      </header>
      <FxCard />
      {list.length === 0 ? (
        <Empty>No buys yet. Buys you check on Today show up here.</Empty>
      ) : (
        <>
          <p className="muted small pad-x">
            ISA and Overseas together, by what you paid (cost basis). Sells aren't tracked.
            {w.unpriced > 0 && ` ${w.unpriced} ${w.unpriced === 1 ? 'buy has' : 'buys have'} no price, so ${w.unpriced === 1 ? 'it counts' : 'they count'} in shares only.`}
          </p>
          <section className="card">
            <div className="card-label">By amount</div>
            {w.amount === null ? (
              <p className="muted small">Enter the USD/KRW exchange rate above to add up dollar and won buys.</p>
            ) : (
              <DonutCard slices={w.amount} format={(v) => fmtMoney(v, 'KRW')} />
            )}
          </section>
          <section className="card">
            <div className="card-label">By shares</div>
            <DonutCard slices={w.shares} format={(v) => shares(v)} />
          </section>
          <h3 className="section-title">Trade history</h3>
          <TradeHistory list={list} s={s} />
        </>
      )}
    </div>
  );
}

/* ───────── 환율 ───────── */

function FxCard() {
  const s = useAppState();
  const [open, setOpen] = useState(false);
  const age = s.fx.updatedAt ? daysBetween(s.fx.updatedAt) : null;
  const stale = fxIsStale(s);
  return (
    <>
      <section className={'card cash-card' + (stale ? ' stale' : '')}>
        <div className="row between">
          <span className="card-label">Exchange rate (USD/KRW)</span>
          {!stale && (
            <button className="qty-link" onClick={() => setOpen(true)}>
              Update
            </button>
          )}
        </div>
        {s.fx.usdKrw !== null ? (
          <div className="fx-value">
            $1 = <b>{fmtMoney(s.fx.usdKrw, 'KRW')}</b>
          </div>
        ) : (
          <p className="small">Enter how many won one dollar is. It's used to add up ISA (₩) and Overseas ($) buys.</p>
        )}
        {age !== null && !stale && <div className="muted small">Updated {ago(age)}</div>}
        {stale && (
          <>
            {age !== null && <p className="warn-text small">Last updated {ago(age)}. Update it every two weeks.</p>}
            <button className="btn primary block" onClick={() => setOpen(true)}>
              {age === null ? 'Enter exchange rate' : 'Update exchange rate'}
            </button>
          </>
        )}
      </section>
      {open && <FxSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function FxSheet({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const [v, setV] = useState('');
  const n = parseNum(v);
  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">Update exchange rate</h2>
      <p className="muted">Enter today's USD/KRW rate (won per $1) from your brokerage app.</p>
      <Field label="$1 =" hint={s.fx.usdKrw !== null ? `Now ${fmtMoney(s.fx.usdKrw, 'KRW')}` : undefined}>
        <NumInput value={v} onChange={setV} placeholder="1,400" suffix="₩" />
      </Field>
      <div className="row gap">
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary grow"
          disabled={!(n > 0)}
          onClick={() => {
            updateFx(n);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/* ───────── 도넛 ───────── */

const R = 46;
const STROKE = 18;
const C = 2 * Math.PI * R;
/** 조각 사이 2px 틈 (원둘레 기준) */
const GAP = 2;

function colorVar(x: Slice): string {
  return x.color < 0 ? 'var(--series-other)' : `var(--series-${x.color + 1})`;
}

function DonutCard({ slices, format }: { slices: Slice[]; format: (v: number) => string }) {
  const [active, setActive] = useState<string | null>(null);
  if (slices.length === 0) return <p className="muted small">Nothing to show yet.</p>;
  const total = slices.reduce((a, x) => a + x.value, 0);
  const sel = slices.find((x) => x.key === active) ?? null;
  const gap = slices.length > 1 ? GAP : 0;
  let offset = 0;
  const toggle = (k: string) => setActive((v) => (v === k ? null : k));

  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 120 120" role="img" aria-label={slices.map((x) => `${x.symbol} ${pct(x.share)}`).join(', ')}>
        <g transform="rotate(-90 60 60)">
          {slices.map((x) => {
            const len = Math.max(0, x.share * C - gap);
            const el = (
              <circle
                key={x.key}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={colorVar(x)}
                strokeWidth={STROKE}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                className={'donut-seg' + (sel && sel.key !== x.key ? ' dim' : '')}
                onClick={() => toggle(x.key)}
              >
                <title>
                  {x.symbol}: {format(x.value)} ({pct(x.share)})
                </title>
              </circle>
            );
            offset += x.share * C;
            return el;
          })}
        </g>
        <text x="60" y="56" textAnchor="middle" className="donut-k">
          {sel ? sel.symbol.slice(0, 12) : 'Total'}
        </text>
        <text x="60" y="72" textAnchor="middle" className="donut-v">
          {sel ? pct(sel.share) : compact(format(total))}
        </text>
      </svg>
      <ul className="donut-legend">
        {slices.map((x) => (
          <li key={x.key}>
            <button className={sel && sel.key !== x.key ? 'dim' : ''} onClick={() => toggle(x.key)}>
              <span className="swatch" style={{ background: colorVar(x) }} />
              <span className="lg-name">{x.symbol}</span>
              <span className="lg-val">{format(x.value)}</span>
              <span className="lg-pct">{pct(x.share)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function pct(v: number): string {
  const p = v * 100;
  // 10% 미만만 소수 한 자리 (9.96%가 "10.0%"로 보이지 않게 반올림 뒤에 판단)
  return `${p.toFixed(Math.round(p * 10) / 10 < 10 ? 1 : 0)}%`;
}

/** 도넛 가운데에 들어가도록 짧게: ₩12,345,678 → ₩12.3M */
function compact(s: string): string {
  const m = s.match(/^([₩$]?)([\d,]+)(.*)$/);
  if (!m) return s;
  const n = Number(m[2].replace(/,/g, ''));
  if (n < 100_000) return s;
  const short = n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}K`;
  return `${m[1]}${short}${m[3]}`;
}

/* ───────── 매수 내역 ───────── */

const PAGE = 30;

function TradeHistory({ list, s }: { list: Trade[]; s: AppState }) {
  const nav = useNav();
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, PAGE);
  const t = (id: string | null) => s.tickers.find((x) => x.id === id);
  return (
    <>
      <section className="card list-card">
        {shown.map((x) => {
          const tk = t(x.tickerId);
          // 기록 시각은 한국 시간. 미장은 뉴욕 날짜가 거래일이라 한국 날짜와 다르면 따로 적는다
          const kstDay = x.at ? ymdIn(KST, new Date(x.at)) : null;
          const sessionNote = x.at && kstDay !== x.date ? ` · ${fmtDay(x.date)} session` : '';
          const krw = x.amount !== null && x.currency === 'USD' ? toKrw(x.amount, 'USD', s.fx.usdKrw) : null;
          return (
            <button key={x.id} className="trade-row" onClick={() => x.planId && nav.push({ name: 'plan', id: x.planId })} disabled={!x.planId}>
              <Logo symbol={x.symbol} group={tk?.group} />
              <span className="trow-main">
                <span className="trow-title">
                  {x.symbol}
                  {x.account && <span className="tag">{accountLabel(x.account)}</span>}
                  {x.source === 'unplanned' && <span className="tag tag-buy">Unplanned</span>}
                </span>
                <span className="trow-sub">
                  {x.source === 'plan' ? x.label : x.source === 'savings' ? 'Savings' : 'Unplanned buy'} · {x.at ? `${fmtKst(x.at)} KST` : fmtDay(x.date)}
                  {sessionNote}
                </span>
              </span>
              <span className="trow-qty">
                <span className="qty">{shares(x.qty)}</span>
                {x.amount !== null && <span className="muted small">{fmtMoney(x.amount, x.currency)}</span>}
                {krw !== null && <span className="muted small">≈ {fmtMoney(krw, 'KRW')}</span>}
              </span>
            </button>
          );
        })}
      </section>
      {list.length > PAGE && !all && (
        <button className="text-btn" onClick={() => setAll(true)}>
          Show all {list.length}
        </button>
      )}
    </>
  );
}

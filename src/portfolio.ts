// 매수 내역과 종목별 비중. ISA와 직투를 합쳐 원화로 본다 (달러는 입력한 환율로).
// 매도는 기록하지 않으므로 비중은 '산 금액(취득원가)' 기준이다.
import { marketOf } from './calc';
import type { Account, AppState, Currency } from './types';
import { parseNum, tradeDay } from './util';

export interface Trade {
  id: string;
  tickerId: string | null;
  symbol: string;
  account: Account | null;
  currency: Currency;
  qty: number;
  /** 체결가 (currency 기준). 모르면 null */
  price: number | null;
  /** 산 금액 (currency 기준). 모르면 null */
  amount: number | null;
  /** 거래일 YYYY-MM-DD (국장: 서울, 미장: 뉴욕 기준) */
  date: string;
  /** 기록한 시각 (ISO). 화면에는 한국 시간으로 보여 준다 */
  at: string | null;
  source: 'plan' | 'unplanned' | 'savings';
  /** 규칙 이름 / Unplanned buy / Savings */
  label: string;
  planId: string | null;
}

/** 예전 규칙 외 매수 기록의 "3 shares @ $12.50" 을 읽는다 */
function parseOffRule(detail: string): { qty: number; price: number | null } | null {
  const m = detail.match(/^(\d+) shares?(?: @ [$₩]([\d,.]+))?/);
  if (!m) return null;
  const price = m[2] ? parseNum(m[2]) : NaN;
  return { qty: Number(m[1]), price: price > 0 ? price : null };
}

/** 모든 매수: 일정 체크, 규칙 외 매수, 적립. 최근 것이 먼저 */
export function trades(s: AppState): Trade[] {
  const out: Trade[] = [];
  const tickerById = (id: string) => s.tickers.find((t) => t.id === id);
  const tickerBySymbol = (sym: string) => s.tickers.find((t) => t.symbol === sym);

  for (const p of s.plans) {
    const t = tickerById(p.tickerId);
    for (const e of p.entries) {
      if (!e.actualQty || !e.date) continue;
      const price = e.price ?? (p.price > 0 ? p.price : null);
      out.push({
        id: `${p.id}:${e.n}`,
        tickerId: p.tickerId,
        symbol: t?.symbol ?? 'Deleted ticker',
        account: t?.account ?? null,
        currency: t?.currency ?? 'USD',
        qty: e.actualQty,
        price,
        amount: e.cost ?? (price !== null ? e.actualQty * price : null),
        date: e.date,
        at: e.checkedAt ?? null,
        source: 'plan',
        label: p.ruleName,
        planId: p.id,
      });
    }
  }

  for (const l of s.logs) {
    if (l.kind !== 'off-rule') continue;
    const t = l.buy ? tickerById(l.buy.tickerId) : tickerBySymbol(l.label);
    const parsed = l.buy ?? parseOffRule(l.detail);
    if (!parsed || parsed.qty <= 0) continue;
    const currency = t?.currency ?? 'USD';
    out.push({
      id: l.id,
      tickerId: t?.id ?? null,
      symbol: t?.symbol ?? l.label,
      account: t?.account ?? null,
      currency,
      qty: parsed.qty,
      price: parsed.price,
      amount: parsed.price !== null ? parsed.qty * parsed.price : null,
      date: l.buy?.date ?? tradeDay(marketOf(t), new Date(l.at)),
      at: l.at,
      source: 'unplanned',
      label: 'Unplanned buy',
      planId: null,
    });
  }

  for (const v of s.savings) {
    const t = tickerBySymbol(v.symbol);
    out.push({
      id: v.id,
      tickerId: t?.id ?? null,
      symbol: v.symbol,
      account: t?.account ?? null,
      // 적립은 원화로 얼마를 넣었는지 기록한다
      currency: 'KRW',
      qty: v.qty,
      price: null,
      amount: v.krw > 0 ? v.krw : null,
      date: v.date,
      at: null,
      source: 'savings',
      label: 'Savings',
      planId: null,
    });
  }

  // 기록한 시각 순 (시각이 없는 적립은 그날 0시로)
  const when = (t: Trade) => t.at ?? `${t.date}T00:00:00.000Z`;
  return out.sort((a, b) => when(b).localeCompare(when(a)));
}

export interface Slice {
  key: string;
  symbol: string;
  value: number;
  share: number;
  /** 종목 목록에서의 순서 */
  slot: number;
  /** 색 번호 0~5. 종목 목록 순서로 정하므로 비중 순위가 바뀌어도 색은 그대로. Other는 -1 */
  color: number;
}

/** 원화 금액. 달러인데 환율을 모르면 null */
export function toKrw(amount: number, cur: Currency, usdKrw: number | null): number | null {
  if (cur === 'KRW') return amount;
  return usdKrw && usdKrw > 0 ? amount * usdKrw : null;
}

const MAX_SLICES = 6;

/** 종목별 합계 → 큰 순서. 6개를 넘으면 나머지는 Other로 묶는다 */
function toSlices(totals: Map<string, { symbol: string; value: number }>, slotOf: (key: string) => number): Slice[] {
  const sum = [...totals.values()].reduce((a, x) => a + x.value, 0);
  if (sum <= 0) return [];
  const rows = [...totals.entries()]
    .filter(([, x]) => x.value > 0)
    .map(([key, x]) => ({ key, symbol: x.symbol, value: x.value, share: x.value / sum, slot: slotOf(key), color: 0 }))
    .sort((a, b) => b.value - a.value);
  let out: Slice[] = rows;
  if (rows.length > MAX_SLICES) {
    const head = rows.slice(0, MAX_SLICES - 1);
    const tail = rows.slice(MAX_SLICES - 1);
    const other = tail.reduce((a, x) => a + x.value, 0);
    out = [...head, { key: 'other', symbol: `Other (${tail.length})`, value: other, share: other / sum, slot: Infinity, color: -1 }];
  }
  const order = out
    .filter((x) => x.key !== 'other')
    .map((x) => x.slot)
    .sort((a, b) => a - b);
  return out.map((x) => (x.key === 'other' ? x : { ...x, color: order.indexOf(x.slot) }));
}

export interface Weights {
  /** 원화 금액 비중. 달러 매수가 있는데 환율이 없으면 null */
  amount: Slice[] | null;
  shares: Slice[];
  /** 금액을 모르는 매수 수 (가격 없이 기록한 규칙 외 매수 등) */
  unpriced: number;
}

export function weights(s: AppState, list: Trade[] = trades(s)): Weights {
  const usdKrw = s.fx.usdKrw;
  const amount = new Map<string, { symbol: string; value: number }>();
  const qty = new Map<string, { symbol: string; value: number }>();
  let missingFx = false;
  let unpriced = 0;
  for (const t of list) {
    const key = t.tickerId ?? `sym:${t.symbol}`;
    const q = qty.get(key) ?? { symbol: t.symbol, value: 0 };
    qty.set(key, { ...q, value: q.value + t.qty });
    if (t.amount === null) {
      unpriced++;
      continue;
    }
    const krw = toKrw(t.amount, t.currency, usdKrw);
    if (krw === null) {
      missingFx = true;
      continue;
    }
    const a = amount.get(key) ?? { symbol: t.symbol, value: 0 };
    amount.set(key, { ...a, value: a.value + krw });
  }
  const slotOf = (key: string) => {
    const i = s.tickers.findIndex((t) => t.id === key);
    return i >= 0 ? i : s.tickers.length + 1;
  };
  return { amount: missingFx ? null : toSlices(amount, slotOf), shares: toSlices(qty, slotOf), unpriced };
}

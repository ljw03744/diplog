import type { Currency, Market } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** 기기 시간 기준 오늘 날짜 YYYY-MM-DD */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* ───────── 거래일과 시간대 ─────────
 * 국장(ISA)은 서울 날짜, 미장(직투)은 뉴욕 날짜가 그 거래의 날짜다.
 * 미장은 정규장부터 애프터마켓까지 뉴욕 기준 같은 날이라, 한국 시간으로
 * 24일 23시에 사든 25일 04시에 사든 24일 거래가 된다. 기록은 한국 시간으로 보여 준다.
 */
export const KST = 'Asia/Seoul';
const MARKET_TZ: Record<Market, string> = { KR: KST, US: 'America/New_York' };

/** 그 시간대의 날짜 YYYY-MM-DD */
export function ymdIn(timeZone: string, d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 그 시장의 거래일 (국장: 서울 날짜, 미장: 뉴욕 날짜) */
export function tradeDay(market: Market, d: Date = new Date()): string {
  return ymdIn(MARKET_TZ[market], d);
}

/** 한국 시간으로 "Nov 25, 2026 04:00" */
export function fmtKst(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')}`;
}

export function fmtMoney(v: number, c: Currency): string {
  return c === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '₩' + Math.round(v).toLocaleString('en-US');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 3, 2026" */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(iso)} ${hh}:${mm}`;
}

/** "Nov 6" from YYYY-MM-DD */
export function fmtDay(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

/** "1,234.5" 같은 입력을 숫자로. 비었거나 잘못되면 NaN */
export function parseNum(s: string): number {
  const t = s.replace(/,/g, '').trim();
  if (t === '') return NaN;
  return Number(t);
}

/** 숫자 입력에 세 자리마다 쉼표: "1234567.5" → "1,234,567.5". decimal이 아니면 소수점을 뺀다 */
export function groupDigits(v: string, decimal = true): string {
  const clean = v.replace(/[^0-9.]/g, '');
  const dot = decimal ? clean.indexOf('.') : -1;
  const int = (dot < 0 ? clean : clean.slice(0, dot)).replace(/\./g, '');
  const frac = dot < 0 ? null : clean.slice(dot + 1).replace(/\./g, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === null ? grouped : `${grouped}.${frac}`;
}

/**
 * 파일을 공유 시트로 보내고, 공유가 안 되는 환경이면 내려받는다.
 * iPhone에서는 공유 시트에서 '파일에 저장'이나 다른 앱(Claude 등)을 고를 수 있다.
 */
export async function shareOrDownload(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // 공유가 막혔으면 다운로드로 넘어간다
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

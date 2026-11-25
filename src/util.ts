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
 * 국장(ISA): 서울 날짜가 거래일.
 * 미장(US): 미국 거래일 하나 = 그날 프리마켓 개장(뉴욕 04:00)부터 다음 거래일 프리마켓 개장 전까지.
 *   프리마켓 04:00–09:30, 정규장 09:30–16:00, 애프터마켓 16:00–20:00 (뉴욕 시간),
 *   그 뒤 국내 증권사 주간거래(뉴욕 20:00–04:00)도 직전 거래일로 본다.
 *   예) 한국 토 05:00 (뉴욕 금 15:00) → 금요일, 한국 월 11:00 주간거래 (뉴욕 일 21:00) → 금요일.
 *   뉴욕 시간대로 계산하므로 서머타임은 저절로 맞는다 (한국 기준 프리마켓 18:00, 서머타임 17:00).
 *   주말과, 사용자가 표시한 미국 휴장일은 건너뛰고 그 전 거래일로 간다.
 * 매수 시각은 그냥 한국 시간으로 보여 준다. 날짜·요일만 거래일 기준.
 */
export const KST = 'Asia/Seoul';
const NY = 'America/New_York';
/** 미국 거래일이 시작되는 뉴욕 시각 (프리마켓 개장) */
const US_DAY_START_HOUR = 4;

interface ZonedParts {
  ymd: string;
  hour: number;
  minute: number;
}

function partsIn(timeZone: string, d: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/** 그 시간대의 날짜 YYYY-MM-DD */
export function ymdIn(timeZone: string, d: Date = new Date()): string {
  return partsIn(timeZone, d).ymd;
}

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** YYYY-MM-DD 하루 전 */
export function prevDay(ymd: string): string {
  return new Date(ymdToUtc(ymd) - 86_400_000).toISOString().slice(0, 10);
}

/** 0 = 일요일 … 6 = 토요일 */
export function weekdayOf(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}

/**
 * 그 시장의 거래일. 국장: 서울 날짜. 미장: 프리마켓 개장 전이면 전날, 주말이면 직전 금요일.
 * usHolidays: 건너뛸 미국 휴장일(YYYY-MM-DD). 매수를 기록할 때 넘긴다.
 * 오늘 화면은 휴장일을 '쉬는 날'로 보여 줘야 하므로 넘기지 않는다.
 */
export function tradeDay(market: Market, d: Date = new Date(), usHolidays: string[] = []): string {
  if (market === 'KR') return ymdIn(KST, d);
  const ny = partsIn(NY, d);
  let day = ny.hour < US_DAY_START_HOUR ? prevDay(ny.ymd) : ny.ymd;
  while (weekdayOf(day) === 0 || weekdayOf(day) === 6 || usHolidays.includes(day)) day = prevDay(day);
  return day;
}

/** 미장 주말: 뉴욕 금 20:00 (애프터마켓 마감) ~ 일 20:00 (주간거래 시작) */
export function usWeekendNow(d: Date = new Date()): boolean {
  const ny = partsIn(NY, d);
  const wd = weekdayOf(ny.ymd);
  return wd === 6 || (wd === 5 && ny.hour >= 20) || (wd === 0 && ny.hour < 20);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 요일과 날짜: "Fri, Nov 27" */
export function fmtWeekDay(ymd: string): string {
  return `${WEEKDAYS[weekdayOf(ymd)]}, ${fmtDay(ymd)}`;
}

/** 거래일과 요일: "Fri, Nov 27, 2026" */
export function fmtTradeDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(ymd)]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * 매수 기록: 날짜·요일은 거래일, 시각은 한국 시간.
 * 같은 날이면 "Wed, Nov 25, 2026 · 09:30 KST",
 * 한국 날짜가 다르면 그 날짜도: "Fri, Nov 27, 2026 · Nov 28 05:00 KST".
 */
export function fmtTradeTime(iso: string, tradeYmd: string): string {
  const k = partsIn(KST, new Date(iso));
  const time = `${String(k.hour).padStart(2, '0')}:${String(k.minute).padStart(2, '0')} KST`;
  return `${fmtTradeDate(tradeYmd)} · ${k.ymd === tradeYmd ? time : `${fmtDay(k.ymd)} ${time}`}`;
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

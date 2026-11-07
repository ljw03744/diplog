import type { Currency } from './types';

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

export function fmtMoney(v: number, c: Currency): string {
  return c === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(v).toLocaleString('ko-KR') + '원';
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(iso)} ${hh}:${mm}`;
}

export function fmtDay(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}.${Number(d)}`;
}

/** "1,234.5" 같은 입력을 숫자로. 비었거나 잘못되면 NaN */
export function parseNum(s: string): number {
  const t = s.replace(/,/g, '').trim();
  if (t === '') return NaN;
  return Number(t);
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

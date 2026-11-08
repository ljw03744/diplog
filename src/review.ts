// Turns off-rule buys and deviation logs into a Markdown document to hand to Claude.
// Nothing leaves the phone on its own: only when the user copies or shares it.
import { groupLabel } from './labels';
import type { AppState, LogItem, LogKind, Rule } from './types';
import { fmtDate, fmtDateTime } from './util';

export const KIND_LABEL: Record<LogKind, string> = {
  'qty-change': 'Amount changed',
  'qty-diff': 'Different amount',
  stop: 'Stopped',
  end: 'Ended',
  delete: 'Deleted',
  concurrent: 'Overlapping buy',
  'off-rule': 'Off-rule buy',
  'rule-edit': 'Rule edited',
  'rule-delete': 'Rule deleted',
};

export type ReviewRange = 90 | 'all';

export interface ReviewStats {
  asPlanned: number;
  total: number;
  offRule: LogItem[];
  others: LogItem[];
}

function sinceDate(range: ReviewRange, now: Date): Date | null {
  if (range === 'all') return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - range);
  return d;
}

/** Fills and logs inside the range, filtered by fill date (YYYY-MM-DD) and log time. */
export function reviewStats(s: AppState, range: ReviewRange, now: Date = new Date()): ReviewStats {
  const since = sinceDate(range, now);
  const inRange = (iso: string) => !since || new Date(iso) >= since;
  const inRangeDay = (ymd: string) => !since || new Date(ymd + 'T00:00:00') >= since;

  let asPlanned = 0;
  let total = 0;
  for (const p of s.plans)
    for (const e of p.entries) {
      if (e.actualQty === null || !e.date || !inRangeDay(e.date)) continue;
      total++;
      if (e.actualQty === e.plannedQty) asPlanned++;
    }
  const logs = s.logs.filter((l) => inRange(l.at)).sort((a, b) => a.at.localeCompare(b.at));
  const offRule = logs.filter((l) => l.kind === 'off-rule');
  const others = logs.filter((l) => l.kind !== 'off-rule');
  return { asPlanned, total: total + offRule.length, offRule, others };
}

function oneLine(text: string): string {
  return text.trim().replace(/\s*\n\s*/g, ' / ');
}

function ruleLine(r: Rule): string {
  const how =
    r.type === 'split'
      ? `split, ${r.percent}% of seed spread over ${r.days} ${r.days === 1 ? 'day' : 'days'}`
      : r.type === 'signal'
        ? `${r.percent}% of seed on each signal`
        : `${r.sharesPerDay} ${r.sharesPerDay === 1 ? 'share' : 'shares'} on each signal day`;
  const note = r.note.trim() ? ` (note: ${oneLine(r.note)})` : '';
  return `- [${groupLabel(r.group)}] ${r.name}: ${how}${note}`;
}

function logBlock(l: LogItem, withKind: boolean): string {
  const head = [fmtDateTime(l.at), withKind ? KIND_LABEL[l.kind] : null, l.label].filter(Boolean).join(' · ');
  const lines = [`### ${head}`];
  if (l.detail) lines.push(`- What: ${l.detail}`);
  lines.push(`- Reason: ${oneLine(l.reason) || '(none)'}`);
  return lines.join('\n');
}

export function buildReview(s: AppState, range: ReviewRange, now: Date = new Date()): string {
  const st = reviewStats(s, range, now);
  const since = sinceDate(range, now);
  const rate = st.total ? `${Math.round((st.asPlanned / st.total) * 100)}%` : 'no data';
  const counts = Object.entries(
    st.others.reduce<Record<string, number>>((acc, l) => {
      acc[KIND_LABEL[l.kind]] = (acc[KIND_LABEL[l.kind]] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');

  const out: string[] = [
    '# DipLog trade review request',
    '',
    "Below is the trading log I keep in the DipLog app. I try to split my buys according to rules I set in advance, and every time I break a rule I write down why. Please read it and analyze the following:",
    '',
    '1. Repeating patterns in my off-rule buys and rule breaks (when, in what situations, with what emotions or excuses)',
    '2. Words and phrases that keep showing up in my reasons, and the motives that might be behind them',
    "3. Which deviations look reasonable and which don't, and why you think so",
    '4. Three concrete suggestions to help me stick to my rules (features or checklists for the app are welcome)',
    '',
    "Don't give investment advice such as stock picks or when to buy or sell; focus on my behavior. If there's too little data to see a pattern, say so.",
    '',
    'Some reasons may be written in Korean. Please answer in English.',
    '',
    '## Period',
    since ? `${fmtDate(since.toISOString())} – ${fmtDate(now.toISOString())} (last ${range} days)` : `All records (through ${fmtDate(now.toISOString())})`,
    '',
    '## Summary',
    `- Rule adherence: ${rate} (${st.asPlanned} of ${st.total} buys on plan, off-rule buys included)`,
    `- Off-rule buys: ${st.offRule.length}`,
    `- Other deviations: ${st.others.length}${counts ? ` (${counts})` : ''}`,
    '',
    '## My buy rules',
  ];
  if (s.commonChecks.length) out.push(`- Common: ${s.commonChecks.join(' / ')}`);
  out.push(...s.rules.map(ruleLine));

  out.push('', `## Off-rule buys (${st.offRule.length})`);
  out.push(st.offRule.length ? st.offRule.map((l) => logBlock(l, false)).join('\n\n') : 'None');

  out.push('', `## Other deviations (${st.others.length})`);
  out.push(st.others.length ? st.others.map((l) => logBlock(l, true)).join('\n\n') : 'None');

  return out.join('\n') + '\n';
}

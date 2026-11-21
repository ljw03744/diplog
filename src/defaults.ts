import { ruleGroupLabel, shares } from './labels';
import type { AppState, LogItem, Rule, RuleGroup, Ticker } from './types';
import { nowIso, uid } from './util';

const SEMI_PRE = 'Precondition: only when the semiconductor index has broken below its 20-week MA.';
const BB_NOTE =
  'Below the 200-day MA, after RSI has dropped under 30 at least once: the 5-day MA is at its lowest and price touches the lower Bollinger Band. Buy on every day that meets this.';
/** 2026-11-21 규칙 변경: 볼밴 하단 매수는 하루 1주가 아니라 비중 3% (금액 기준) */
const BB_CHANGE = 'Changed Nov 21, 2026: 3% per signal (was 2%). Sized by amount now, not 1 share a day.';
const COMMON_BB_NOTE = '1 share on each day price touches the lower Bollinger Band while below the 200-day MA.';
/** 2026-11-22: BB-dip은 살 때마다 그 순간 현금 잔고의 3% */
const BB_CASH_NOTE = 'Each buy is 3% of your cash balance at that moment, so buys get smaller as cash goes down.';
const OLD_BB_NAME = 'Lower BB after RSI<30';
const BB_NAME = 'BB-dip';

/** ETF 규칙을 반도체 종목에 쓸 때의 전제 조건 (예전 반도체 규칙의 메모) */
const ETF_SEMI_NOTE = 'Semis: only after the semiconductor index has broken below its 20-week MA.';

/**
 * 기본 규칙 개정 번호.
 * 2 = 볼밴 하단 3% + 하루 1주 규칙 없앰
 * 3 = 나스닥·반도체 규칙을 ETF 하나로 합침 (반도체는 200주선만 남김)
 * 4 = 볼밴 규칙 이름 BB-dip, '씨드' 대신 '현금'
 */
export const RULES_REV = 4;
const OLD_STOCK_NOTE = 'Swing trades: enter 20% of your cash as the seed. No leveraged ETFs until the 200-day MA breaks.';
const STOCK_NOTE = 'Swing trades: use 20% of your cash. No leveraged ETFs until the 200-day MA breaks.';
const OLD_200W_NOTE = 'Essentially all-in. Afterwards, keep going with the ETF lower-BB rule.';
const NOTE_200W = 'Essentially all-in. Afterwards, keep going with the ETF BB-dip rule.';

export const DEFAULT_GROUP_ORDER: RuleGroup[] = ['ETF', '반도체', '개별', '공통'];

function maRules(group: RuleGroup, prefix: string, note = ''): Rule[] {
  const rows: [string, number, number][] = [
    ['20-day MA touch', 5, 1],
    ['50-day MA touch', 15, 5],
    ['100-day MA touch', 20, 5],
    ['200-day MA touch', 25, 5],
  ];
  return [
    ...rows.map(([name, percent, days], i) => ({
      id: `${prefix}-${i + 1}`,
      name,
      group,
      type: 'split' as const,
      percent,
      days,
      sharesPerDay: 0,
      note,
    })),
    {
      id: `${prefix}-bb`,
      name: BB_NAME,
      group,
      type: 'signal',
      percent: 3,
      days: 0,
      sharesPerDay: 0,
      note: [note, BB_NOTE, BB_CASH_NOTE, BB_CHANGE].filter(Boolean).join('\n'),
    },
  ];
}

export const DEFAULT_RULES: Rule[] = [
  ...maRules('ETF', 'etf', ETF_SEMI_NOTE),
  {
    id: 'semi-200w',
    name: '200-week MA touch',
    group: '반도체',
    type: 'split',
    percent: 70,
    days: 1,
    sharesPerDay: 0,
    note: [SEMI_PRE, NOTE_200W].join('\n'),
  },
  ...maRules('개별', 'stock', STOCK_NOTE).slice(0, 4),
];

export const DEFAULT_TICKERS: Ticker[] = [
  { id: 't-qld', symbol: 'QLD', name: 'Nasdaq-100 2x', currency: 'USD', account: '직투', group: '나스닥' },
  { id: 't-usd', symbol: 'USD', name: 'Semiconductors 2x', currency: 'USD', account: '직투', group: '반도체' },
  {
    id: 't-tiger-qld',
    symbol: 'TIGER 나스닥100레버리지',
    name: 'ISA · Nasdaq-100 2x',
    currency: 'KRW',
    account: 'ISA',
    group: '나스닥',
  },
  { id: 't-boxx', symbol: 'BOXX', name: 'Short-term T-bills (savings)', currency: 'USD', account: '직투', group: '채권' },
];

export const DEFAULT_COMMON_CHECKS = [
  'The price is in a downtrend.',
  "We're not between a 200-day MA touch and normalization (daily MAs back in order). The BB rules are exempt.",
  'I checked the priority: Semis > Nasdaq.',
];

export function initialState(): AppState {
  return {
    version: 1,
    tickers: DEFAULT_TICKERS,
    rules: DEFAULT_RULES,
    commonChecks: DEFAULT_COMMON_CHECKS,
    plans: [],
    logs: [],
    savings: [],
    cash: { ISA: null, 직투: null, updatedAt: null },
    closedDays: [],
    settings: {
      lastBackupAt: null,
      rulesRev: RULES_REV,
      savingsSymbol: 'BOXX',
      savingsTarget: 60,
      ruleGroupOrder: DEFAULT_GROUP_ORDER,
    },
  };
}

/* ───────── Default rule revisions ─────────
 * When the app changes a default rule, data already on the phone is updated once.
 * Only rules that still look like the old default are touched, and every change
 * goes into the log like a hand edit would.
 */

const REV2_REASON = 'Rule change (Nov 21, 2026): lower-BB buys are now 3% per signal by amount, not 1 share a day.';

const REV3_REASON =
  'Rule change (Nov 22, 2026): Nasdaq and semis rules were nearly the same, so rules are now split into ETF and individual stocks. Semis keeps only the 200-week MA touch.';

/** rev: 저장된 데이터의 개정 번호 (없으면 1) */
export function migrateRules(s: AppState, rev: number): AppState {
  if (rev >= RULES_REV) return s;
  const logs: LogItem[] = [];
  const at = nowIso();
  const addLog = (kind: 'rule-edit' | 'rule-delete', label: string, detail: string, reason: string) =>
    logs.push({ id: uid(), at, kind, planId: null, label, detail, reason });
  // 예전 데이터에는 '나스닥' 같은 그룹 값이 남아 있을 수 있다
  const groupOf = (r: Rule) => r.group as string;
  let rules = s.rules;

  if (rev < 2) {
    rules = rules.flatMap((r): Rule[] => {
      const label = `[${ruleGroupLabel(r.group)}] ${r.name}`;
      if ((r.id === 'ndx-bb' || r.id === 'semi-bb') && r.type === 'signal' && r.percent === 2) {
        addLog('rule-edit', label, '2% per signal → 3% per signal, note edited', REV2_REASON);
        return [{ ...r, percent: 3, note: [r.note.trim(), BB_CHANGE].filter(Boolean).join('\n') }];
      }
      if (r.id === 'common-bb-1' && r.type === 'fixed') {
        addLog('rule-delete', label, `${shares(r.sharesPerDay)} per signal (replaced by the 3% lower-BB rule)`, REV2_REASON);
        return [];
      }
      return [r];
    });
  }

  if (rev < 3) {
    const before = rules;
    const same = (a: Rule, b: Rule | undefined) =>
      !!b && a.type === b.type && a.percent === b.percent && a.days === b.days && a.sharesPerDay === b.sharesPerDay;
    const removed: string[] = [];
    rules = before.flatMap((r): Rule[] => {
      if (groupOf(r) === '나스닥') {
        const note = r.id.startsWith('ndx-') && !r.note.includes(ETF_SEMI_NOTE) ? [r.note.trim(), ETF_SEMI_NOTE].filter(Boolean).join('\n') : r.note;
        return [{ ...r, group: 'ETF', note }];
      }
      // 나스닥 규칙과 똑같은 기본 반도체 규칙은 ETF 규칙과 겹치므로 뺀다. 직접 바꾼 것은 '반도체만'으로 남긴다
      if (groupOf(r) === '반도체' && /^semi-(\d|bb$)/.test(r.id) && same(r, before.find((x) => x.id === r.id.replace('semi-', 'ndx-')))) {
        removed.push(r.name);
        return [];
      }
      return [r];
    });
    const changed = before.some((r) => groupOf(r) === '나스닥') || removed.length > 0;
    if (changed) {
      const detail = ['Nasdaq rules → ETF (used for Nasdaq and semis ETFs)'];
      if (removed.length) detail.push(`Removed duplicate semis rules: ${removed.join(', ')}`);
      addLog('rule-edit', 'Rule groups', detail.join('\n'), REV3_REASON);
    }
  }

  let plans = s.plans;
  if (rev < 4) {
    rules = rules.map((r) => {
      let next = r;
      if (r.type === 'signal' && r.name === OLD_BB_NAME) {
        addLog('rule-edit', `[${ruleGroupLabel(r.group)}] ${BB_NAME}`, `name ${OLD_BB_NAME} → ${BB_NAME}, note edited`, REV4_REASON);
        next = { ...r, name: BB_NAME, note: [r.note.trim(), BB_CASH_NOTE].filter(Boolean).join('\n') };
      }
      // 메모 속 '씨드' 표현을 '현금'으로
      const note = next.note.replace(OLD_STOCK_NOTE, STOCK_NOTE).replace(OLD_200W_NOTE, NOTE_200W);
      return note === next.note ? next : { ...next, note };
    });
    plans = plans.map((p) => (p.ruleType === 'signal' && p.ruleName === OLD_BB_NAME ? { ...p, ruleName: BB_NAME } : p));
  }

  return { ...s, rules, plans, logs: [...logs.reverse(), ...s.logs], settings: { ...s.settings, rulesRev: RULES_REV } };
}

const REV4_REASON =
  'Rule change (Nov 22, 2026): renamed to BB-dip. Each buy is now 3% of the cash balance at that moment, not a fixed amount.';

/* ───────── Korean → English migration ─────────
 * The app used to ship Korean defaults. Default rules, checklist items, ticker
 * descriptions and plan rule names that still match the old Korean text exactly
 * are switched to English. Anything the user wrote or edited is left alone, and
 * so are log entries, which are records.
 */

const KO_SEMI_PRE = '전제 조건: 반도체 지수가 20주 이평선을 뚫고 내려온 경우에만.';
const KO_BB_NOTE =
  '200일 이평선 밑이고 RSI < 30이 한 번이라도 된 뒤, 5일 이평선이 가장 하단 + 주가가 볼린저 밴드 하단 터치. 조건을 만족하는 날마다.';
const KO_STOCK_NOTE = '스윙 투자: 씨드는 현금의 20%를 기준으로 입력. 레버리지는 200일선이 뚫리기 전까지 사지 않는다.';

const RULE_NAME_KO_EN: Record<string, string> = {
  '20일선 터치': '20-day MA touch',
  '50일선 터치': '50-day MA touch',
  '100일선 터치': '100-day MA touch',
  '200일선 터치': '200-day MA touch',
  'RSI<30 이후 볼밴 하단': 'Lower BB after RSI<30',
  '200주선 터치': '200-week MA touch',
  '200일선 아래 · 볼밴 하단 · 하루 1주': 'Below 200-day · lower BB · 1 share',
};

const NOTE_KO_EN: Record<string, string> = {
  [KO_SEMI_PRE]: SEMI_PRE,
  [KO_BB_NOTE]: BB_NOTE,
  [`${KO_SEMI_PRE}\n${KO_BB_NOTE}`]: `${SEMI_PRE}\n${BB_NOTE}`,
  [KO_STOCK_NOTE]: STOCK_NOTE,
  '사실상 전 재산. 이후 볼밴 규칙(RSI<30 이후 볼밴 하단)을 이어서 실시.': DEFAULT_RULES.find((r) => r.id === 'semi-200w')!.note,
  '200일 이평선 밑에서 볼린저 밴드 하단 터치한 날 1주.': COMMON_BB_NOTE,
};

const CHECK_KO_EN: Record<string, string> = {
  '주가가 하락 추세다.': DEFAULT_COMMON_CHECKS[0],
  '200일선 터치 이후 정상화(일봉 이평선 정렬) 전이 아니다. (볼밴 규칙은 예외)': DEFAULT_COMMON_CHECKS[1],
  '우선순위를 확인했다: 반도체 > 나스닥.': DEFAULT_COMMON_CHECKS[2],
};

const TICKER_NAME_KO_EN: Record<string, string> = {
  '나스닥100 2배': 'Nasdaq-100 2x',
  '반도체 2배': 'Semiconductors 2x',
  'ISA · 나스닥100 2배': 'ISA · Nasdaq-100 2x',
  '단기채 (적립용)': 'Short-term T-bills (savings)',
};

export function migrateToEnglish(s: AppState): AppState {
  return {
    ...s,
    rules: s.rules.map((r) => ({
      ...r,
      name: RULE_NAME_KO_EN[r.name] ?? r.name,
      note: NOTE_KO_EN[r.note] ?? r.note,
    })),
    plans: s.plans.map((p) => ({ ...p, ruleName: RULE_NAME_KO_EN[p.ruleName] ?? p.ruleName })),
    commonChecks: s.commonChecks.map((c) => CHECK_KO_EN[c] ?? c),
    tickers: s.tickers.map((t) => ({ ...t, name: TICKER_NAME_KO_EN[t.name] ?? t.name })),
  };
}

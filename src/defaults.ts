import type { AppState, Rule, RuleGroup, Ticker } from './types';

const SEMI_PRE = 'Precondition: only when the semiconductor index has broken below its 20-week MA.';
const BB_NOTE =
  'Below the 200-day MA, after RSI has dropped under 30 at least once: the 5-day MA is at its lowest and price touches the lower Bollinger Band. Buy on every day that meets this.';
const STOCK_NOTE = 'Swing trades: enter 20% of your cash as the seed. No leveraged ETFs until the 200-day MA breaks.';

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
      name: 'Lower BB after RSI<30',
      group,
      type: 'signal',
      percent: 2,
      days: 0,
      sharesPerDay: 0,
      note: [note, BB_NOTE].filter(Boolean).join('\n'),
    },
  ];
}

export const DEFAULT_RULES: Rule[] = [
  ...maRules('나스닥', 'ndx'),
  ...maRules('반도체', 'semi', SEMI_PRE),
  {
    id: 'semi-200w',
    name: '200-week MA touch',
    group: '반도체',
    type: 'split',
    percent: 70,
    days: 1,
    sharesPerDay: 0,
    note: 'Essentially all-in. Afterwards, keep going with the lower-BB rule (Lower BB after RSI<30).',
  },
  ...maRules('개별', 'stock', STOCK_NOTE).slice(0, 4),
  {
    id: 'common-bb-1',
    name: 'Below 200-day · lower BB · 1 share',
    group: '공통',
    type: 'fixed',
    percent: 0,
    days: 0,
    sharesPerDay: 1,
    note: '1 share on each day price touches the lower Bollinger Band while below the 200-day MA.',
  },
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
    settings: { lastBackupAt: null, savingsSymbol: 'BOXX', savingsTarget: 60 },
  };
}

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
  '200일 이평선 밑에서 볼린저 밴드 하단 터치한 날 1주.': DEFAULT_RULES.find((r) => r.id === 'common-bb-1')!.note,
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

import type { AppState, Rule, RuleGroup, Ticker } from './types';

const SEMI_PRE = '전제 조건: 반도체 지수가 20주 이평선을 뚫고 내려온 경우에만.';
const BB_NOTE =
  '200일 이평선 밑이고 RSI < 30이 한 번이라도 된 뒤, 5일 이평선이 가장 하단 + 주가가 볼린저 밴드 하단 터치. 조건을 만족하는 날마다.';

function maRules(group: RuleGroup, prefix: string, note = ''): Rule[] {
  const rows: [string, number, number][] = [
    ['20일선 터치', 5, 1],
    ['50일선 터치', 15, 5],
    ['100일선 터치', 20, 5],
    ['200일선 터치', 25, 5],
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
      name: 'RSI<30 이후 볼밴 하단',
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
    name: '200주선 터치',
    group: '반도체',
    type: 'split',
    percent: 70,
    days: 1,
    sharesPerDay: 0,
    note: '사실상 전 재산. 이후 볼밴 규칙(RSI<30 이후 볼밴 하단)을 이어서 실시.',
  },
  ...maRules(
    '개별',
    'stock',
    '스윙 투자: 씨드는 현금의 20%를 기준으로 입력. 레버리지는 200일선이 뚫리기 전까지 사지 않는다.',
  ).slice(0, 4),
  {
    id: 'common-bb-1',
    name: '200일선 아래 · 볼밴 하단 · 하루 1주',
    group: '공통',
    type: 'fixed',
    percent: 0,
    days: 0,
    sharesPerDay: 1,
    note: '200일 이평선 밑에서 볼린저 밴드 하단 터치한 날 1주.',
  },
];

export const DEFAULT_TICKERS: Ticker[] = [
  { id: 't-qld', symbol: 'QLD', name: '나스닥100 2배', currency: 'USD', account: '직투', group: '나스닥' },
  { id: 't-usd', symbol: 'USD', name: '반도체 2배', currency: 'USD', account: '직투', group: '반도체' },
  {
    id: 't-tiger-qld',
    symbol: 'TIGER 나스닥100레버리지',
    name: 'ISA · 나스닥100 2배',
    currency: 'KRW',
    account: 'ISA',
    group: '나스닥',
  },
  { id: 't-boxx', symbol: 'BOXX', name: '단기채 (적립용)', currency: 'USD', account: '직투', group: '채권' },
];

export const DEFAULT_COMMON_CHECKS = [
  '주가가 하락 추세다.',
  '200일선 터치 이후 정상화(일봉 이평선 정렬) 전이 아니다. (볼밴 규칙은 예외)',
  '우선순위를 확인했다: 반도체 > 나스닥.',
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

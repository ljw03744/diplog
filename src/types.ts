export type Currency = 'USD' | 'KRW';
export type Account = '직투' | 'ISA';
export type TickerGroup = '나스닥' | '반도체' | '개별' | '채권';
export type RuleGroup = TickerGroup | '공통';

/**
 * split:  비중 % 를 N일에 나눠 매수 (예: 100일선 → 20% / 5일)
 * signal: 조건을 만족하는 날마다 비중 % 매수 (끝나는 날 없음)
 * fixed:  조건을 만족하는 날마다 고정 N주 (끝나는 날 없음)
 */
export type RuleType = 'split' | 'signal' | 'fixed';

export interface Ticker {
  id: string;
  symbol: string;
  name: string;
  currency: Currency;
  account: Account;
  group: TickerGroup;
}

export interface Rule {
  id: string;
  name: string;
  group: RuleGroup;
  type: RuleType;
  /** split / signal: 씨드 대비 % */
  percent: number;
  /** split: 나눠 사는 일 수 */
  days: number;
  /** fixed: 하루 N주 */
  sharesPerDay: number;
  /** 전제 조건 등. 일정을 추가할 때 함께 보인다. */
  note: string;
}

export interface Entry {
  /** 1부터 시작하는 회차 번호 */
  n: number;
  plannedQty: number;
  /** 체결한 날짜 (YYYY-MM-DD). 아직이면 null */
  date: string | null;
  actualQty: number | null;
}

export type PlanStatus = 'active' | 'done' | 'stopped';

export interface Plan {
  id: string;
  tickerId: string;
  ruleId: string;
  /** 만든 시점의 규칙 사본. 규칙이 나중에 바뀌어도 이 일정은 그대로 */
  ruleName: string;
  ruleType: RuleType;
  percent: number;
  days: number;
  seed: number;
  seedCurrency: Currency;
  /** 1달러 = fxRate 원. 통화가 같으면 1 */
  fxRate: number;
  price: number;
  /** 종목 통화 기준 이번 일정에 쓰는 금액 */
  amount: number;
  totalQty: number;
  /** split: 하루 수량, signal/fixed: 한 번에 사는 수량 */
  dailyQty: number;
  /** split: 하루 수량으로 나누고 남은 수량 */
  remainder: number;
  remainderDone: boolean;
  entries: Entry[];
  status: PlanStatus;
  createdAt: string;
  endedAt: string | null;
}

export type LogKind =
  | 'qty-change'
  | 'qty-diff'
  | 'stop'
  | 'end'
  | 'delete'
  | 'concurrent'
  | 'off-rule'
  | 'rule-edit'
  | 'rule-delete';

export interface LogItem {
  id: string;
  at: string;
  kind: LogKind;
  planId: string | null;
  /** 예: "QLD · 100일선 터치" */
  label: string;
  detail: string;
  reason: string;
}

export interface Saving {
  id: string;
  date: string;
  symbol: string;
  qty: number;
  krw: number;
}

export interface Settings {
  lastBackupAt: string | null;
  savingsSymbol: string;
  savingsTarget: number;
}

export interface AppState {
  version: 1;
  tickers: Ticker[];
  rules: Rule[];
  /** 일정을 시작하기 전에 모두 체크해야 하는 공통 규칙 */
  commonChecks: string[];
  plans: Plan[];
  logs: LogItem[];
  savings: Saving[];
  settings: Settings;
}

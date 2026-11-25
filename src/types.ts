export type Currency = 'USD' | 'KRW';
export type Account = '직투' | 'ISA';
export type TickerGroup = '나스닥' | '반도체' | '개별' | '채권';
/**
 * ETF:  나스닥·반도체 레버리지 ETF 공통 규칙
 * 반도체: 반도체 종목에만 (200주선 터치)
 * 개별: 개별주
 * 공통: 모든 종목 (예전 데이터 호환용, 새로 만들지 않음)
 */
export type RuleGroup = 'ETF' | '반도체' | '개별' | '공통';
/** 국장(KRX) / 미장 */
export type Market = 'KR' | 'US';

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
  /** 체크할 때 입력한 가격 (종목 통화). 예전 기록에는 없음 */
  price?: number | null;
  /** 실제로 쓴 금액 = actualQty × price (종목 통화) */
  cost?: number | null;
  /** 이 체크로 계좌 현금에서 뺀 금액 (계좌 통화). 체크 취소 때 되돌린다 */
  cashDeducted?: { account: Account; amount: number } | null;
  checkedAt?: string | null;
}

/**
 * amount: 금액 기준. 회차마다 그날 가격을 입력하면 살 수량이 나온다 (새 일정)
 * shares: 수량 기준. 만들 때 정한 수량대로 산다 (고정 수량, 예전 일정)
 */
export type Sizing = 'amount' | 'shares';

export type PlanStatus = 'active' | 'done' | 'stopped';

export interface Plan {
  id: string;
  tickerId: string;
  ruleId: string;
  /** 만든 시점의 규칙 사본. 규칙이 나중에 바뀌어도 이 일정은 그대로 */
  ruleName: string;
  ruleType: RuleType;
  /** 없으면 'shares' (예전 일정) */
  sizing?: Sizing;
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
  /** 규칙 외 매수: 종목·수량·가격·거래일. 예전 기록에는 없음 (label·detail에서 읽어 낸다) */
  buy?: { tickerId: string; qty: number; price: number | null; date: string };
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
  /** 기본 규칙 개정 번호. 앱이 기본 규칙을 바꾸면 올라간다 */
  rulesRev: number;
  savingsSymbol: string;
  savingsTarget: number;
  /** 규칙 화면·일정 추가 화면에서 규칙 그룹을 보여 주는 순서 */
  ruleGroupOrder: RuleGroup[];
}

/** 평일 휴장일 (사용자가 직접 표시) */
export interface ClosedDay {
  date: string;
  market: Market;
}

/** 계좌별 보유 현금. ISA는 원화, 직투는 달러. 입력한 적 없으면 null */
export interface Cash {
  ISA: number | null;
  직투: number | null;
  /** 사용자가 실제 잔고로 마지막에 맞춘 시각 */
  updatedAt: string | null;
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
  cash: Cash;
  closedDays: ClosedDay[];
  /** 1달러 = 몇 원. 포트폴리오 화면에서 입력하고, 2주마다 최신화를 권한다 */
  fx: { usdKrw: number | null; updatedAt: string | null };
  settings: Settings;
}

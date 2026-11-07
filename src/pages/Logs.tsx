import { useState } from 'react';
import { compliance } from '../calc';
import { useAppState } from '../store';
import type { LogItem, LogKind } from '../types';
import { Empty, Segmented } from '../ui';
import { fmtDateTime } from '../util';

export const KIND_LABEL: Record<LogKind, string> = {
  'qty-change': '수량 변경',
  'qty-diff': '수량 다름',
  stop: '중단',
  end: '종료',
  delete: '삭제',
  concurrent: '동시 진행',
  'off-rule': '규칙 외 매수',
  'rule-edit': '규칙 수정',
  'rule-delete': '규칙 삭제',
};

const STRONG: LogKind[] = ['off-rule', 'concurrent', 'qty-diff', 'rule-edit', 'rule-delete'];

export function LogCard({ l }: { l: LogItem }) {
  return (
    <article className="card log">
      <div className="row between">
        <span className={'tag' + (STRONG.includes(l.kind) ? ' tag-warn' : '')}>{KIND_LABEL[l.kind]}</span>
        <span className="muted small">{fmtDateTime(l.at)}</span>
      </div>
      <div className="log-label">{l.label}</div>
      {l.detail && <div className="muted small">{l.detail}</div>}
      <blockquote>{l.reason}</blockquote>
    </article>
  );
}

type Filter = 'all' | 'off' | 'change';

export function LogsTab() {
  const s = useAppState();
  const [filter, setFilter] = useState<Filter>('all');
  const offRule = s.logs.filter((l) => l.kind === 'off-rule').length;
  const c = compliance(s.plans, offRule);
  const changes = s.logs.filter((l) => l.kind !== 'off-rule').length;
  const list = s.logs.filter((l) => (filter === 'all' ? true : filter === 'off' ? l.kind === 'off-rule' : l.kind !== 'off-rule'));

  return (
    <div className="tab">
      <header className="tab-head">
        <h1>기록</h1>
      </header>
      <section className="stats">
        <div className="stat">
          <div className="stat-v">{c.rate === null ? '—' : `${Math.round(c.rate * 100)}%`}</div>
          <div className="stat-l">규칙 준수율</div>
          <div className="stat-s">
            {c.asPlanned}/{c.total}회 계획대로
          </div>
        </div>
        <div className="stat">
          <div className="stat-v">{offRule}</div>
          <div className="stat-l">규칙 외 매수</div>
        </div>
        <div className="stat">
          <div className="stat-v">{changes}</div>
          <div className="stat-l">변경 기록</div>
        </div>
      </section>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: '전체' },
          { value: 'change', label: '변경' },
          { value: 'off', label: '규칙 외' },
        ]}
      />
      {list.length === 0 ? (
        <Empty>
          아직 기록이 없습니다.
          <br />
          규칙대로만 했다면 좋은 신호입니다.
        </Empty>
      ) : (
        <div className="stack">
          {list.map((l) => (
            <LogCard key={l.id} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}

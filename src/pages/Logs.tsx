import { useState } from 'react';
import { compliance } from '../calc';
import { IconSpark } from '../icons';
import { buildReview, KIND_LABEL, reviewStats, type ReviewRange } from '../review';
import { getState, useAppState } from '../store';
import type { LogItem, LogKind } from '../types';
import { Empty, Segmented } from '../ui';
import { fmtDateTime, shareOrDownload, todayStr } from '../util';

export { KIND_LABEL };

const WARN: LogKind[] = ['concurrent', 'qty-diff', 'rule-edit', 'rule-delete'];

function tagClass(kind: LogKind): string {
  if (kind === 'off-rule') return 'tag tag-buy';
  if (WARN.includes(kind)) return 'tag tag-warn';
  return 'tag tag-accent';
}

export function LogCard({ l }: { l: LogItem }) {
  return (
    <article className="card log">
      <div className="row between">
        <span className={tagClass(l.kind)}>{KIND_LABEL[l.kind]}</span>
        <span className="muted small">{fmtDateTime(l.at)}</span>
      </div>
      <div className="log-label">{l.label}</div>
      {l.detail && <div className="muted small">{l.detail}</div>}
      <blockquote>{l.reason}</blockquote>
    </article>
  );
}

/** Half-circle gauge. value is 0 to 1 */
function Gauge({ value, label }: { value: number | null; label: string }) {
  const r = 80;
  const cx = 100;
  const cy = 98;
  const v = Math.max(0, Math.min(1, value ?? 0));
  const a = Math.PI * (1 - v);
  const x = cx + r * Math.cos(a);
  const y = cy - r * Math.sin(a);
  return (
    <svg className="gauge" viewBox="0 0 200 112" role="img" aria-label={`Rule adherence ${label}`}>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--fill)" strokeWidth="16" strokeLinecap="round" />
      {value !== null && v > 0 && (
        <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke="var(--accent)" strokeWidth="16" strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 6} textAnchor="middle">
        {label}
      </text>
    </svg>
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
  const rateLabel = c.rate === null ? '—' : `${Math.round(c.rate * 100)}%`;

  return (
    <div className="tab">
      <header className="tab-head">
        <h1>Log</h1>
      </header>
      <section className="card gauge-card">
        <div className="card-label">Overall rule adherence</div>
        <Gauge value={c.rate} label={rateLabel} />
        <div className="gauge-sub">{c.total ? `On plan ${c.asPlanned} of ${c.total} buys` : 'No buys checked yet'}</div>
        <div className="gauge-stats">
          <div>
            <b style={{ color: offRule ? 'var(--buy)' : undefined }}>{offRule}</b>
            <span>Off-rule buys</span>
          </div>
          <div>
            <b>{changes}</b>
            <span>Changes</span>
          </div>
        </div>
      </section>

      <ReviewCard hasLogs={s.logs.length > 0} />

      <h3 className="section-title">All entries</h3>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'change', label: 'Changes' },
          { value: 'off', label: 'Off-rule' },
        ]}
      />
      {list.length === 0 ? (
        <Empty>
          Nothing logged yet.
          <br />
          If you've stuck to your rules, that's a good sign.
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

/** Card that turns off-rule buys and deviation reasons into a document for Claude */
function ReviewCard({ hasLogs }: { hasLogs: boolean }) {
  const [range, setRange] = useState<ReviewRange>(90);
  const [msg, setMsg] = useState<string | null>(null);
  const st = reviewStats(getState(), range);
  const count = st.offRule.length + st.others.length;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(buildReview(getState(), range));
      setMsg('Copied. Open Claude and paste it.');
    } catch {
      setMsg("Couldn't copy. Use Send as file instead.");
    }
  }

  async function onShare() {
    const name = `diplog-review-${todayStr()}.md`;
    const r = await shareOrDownload(new File([buildReview(getState(), range)], name, { type: 'text/markdown' }));
    if (r === 'cancelled') return;
    setMsg(r === 'shared' ? 'Sent. If you picked the Claude app, you can ask for the review right away.' : 'File downloaded. Attach it in Claude.');
  }

  if (!hasLogs) return null;
  return (
    <section className="card ai-card">
      <h2>
        <IconSpark />
        Review with Claude
      </h2>
      <p>Bundles your off-rule buys and deviation reasons into a request asking Claude to find repeating patterns and ways to improve. It only leaves your phone when you copy or send it.</p>
      <Segmented
        value={String(range)}
        onChange={(v) => {
          setRange(v === 'all' ? 'all' : 90);
          setMsg(null);
        }}
        options={[
          { value: '90', label: 'Last 90 days' },
          { value: 'all', label: 'All time' },
        ]}
      />
      <div className="muted small">
        {st.offRule.length} off-rule · {st.others.length} other {st.others.length === 1 ? 'deviation' : 'deviations'}
      </div>
      <div className="row gap">
        <button className="btn primary grow" disabled={count === 0} onClick={onCopy}>
          Copy
        </button>
        <button className="btn ghost grow" disabled={count === 0} onClick={onShare}>
          Send as file
        </button>
      </div>
      <a className="link small center" href="https://claude.ai/new" target="_blank" rel="noreferrer">
        Open Claude
      </a>
      {msg && <div className="toast-inline center">{msg}</div>}
    </section>
  );
}

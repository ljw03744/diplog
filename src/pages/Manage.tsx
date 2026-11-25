import { useState } from 'react';
import {
  addOffRule,
  addSaving,
  deleteRule,
  deleteSaving,
  deleteTicker,
  MIN_REASON,
  moveRule,
  moveRuleGroup,
  onlyRenamed,
  saveCommonChecks,
  saveRule,
  saveTicker,
  setSavingsTarget,
} from '../actions';
import { IconDown, IconUp } from '../icons';
import { accountLabel, groupLabel, ruleGroupLabel, shares as sharesText } from '../labels';
import { useNav } from '../nav';
import { useAppState } from '../store';
import type { Account, Currency, Rule, RuleGroup, RuleType, TickerGroup } from '../types';
import { Bar, ConfirmSheet, Empty, Field, NumInput, Page, ReasonInput, ReasonSheet, Segmented } from '../ui';
import { fmtDay, fmtMoney, parseNum, todayStr, uid } from '../util';
import { ruleText } from './NewPlan';

const TICKER_GROUPS: TickerGroup[] = ['나스닥', '반도체', '개별', '채권'];
/** 새 규칙에 고를 수 있는 그룹. '공통'은 예전 데이터에만 남아 있다 */
const RULE_GROUPS: RuleGroup[] = ['ETF', '반도체', '개별'];

const RULE_GROUP_HINT: Record<RuleGroup, string> = {
  ETF: 'Used for Nasdaq and semis ETFs.',
  반도체: 'Only for semis tickers.',
  개별: 'Only for individual stocks.',
  공통: 'Can be picked for any ticker.',
};

function MoveButtons({ onUp, onDown, label }: { onUp?: () => void; onDown?: () => void; label: string }) {
  return (
    <span className="move-btns">
      <button aria-label={`Move ${label} up`} disabled={!onUp} onClick={onUp}>
        <IconUp />
      </button>
      <button aria-label={`Move ${label} down`} disabled={!onDown} onClick={onDown}>
        <IconDown />
      </button>
    </span>
  );
}

/* ───────── Tickers ───────── */

export function TickersPage() {
  const s = useAppState();
  const nav = useNav();
  return (
    <Page title="Tickers" back="Back" right={<button className="link" onClick={() => nav.push({ name: 'tickerForm' })}>Add</button>}>
      <nav className="menu card">
        {s.tickers.map((t) => (
          <button key={t.id} onClick={() => nav.push({ name: 'tickerForm', id: t.id })}>
            <span>
              <b>{t.symbol}</b> <span className="muted small">{t.name}</span>
            </span>
            <span className="muted small">
              {groupLabel(t.group)} · {accountLabel(t.account)} ›
            </span>
          </button>
        ))}
      </nav>
    </Page>
  );
}

export function TickerFormPage({ id }: { id?: string }) {
  const s = useAppState();
  const nav = useNav();
  const old = s.tickers.find((t) => t.id === id);
  const [symbol, setSymbol] = useState(old?.symbol ?? '');
  const [name, setName] = useState(old?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(old?.currency ?? 'USD');
  const [account, setAccount] = useState<Account>(old?.account ?? '직투');
  const [group, setGroup] = useState<TickerGroup>(old?.group ?? '나스닥');
  const used = !!old && s.plans.some((p) => p.tickerId === old.id);
  const [ask, setAsk] = useState(false);

  function save() {
    saveTicker({ id: old?.id ?? uid(), symbol: symbol.trim(), name: name.trim(), currency, account, group });
    nav.pop();
  }

  return (
    <Page title={old ? 'Edit ticker' : 'Add ticker'} back="Cancel">
      <Field label="Symbol / name">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="QLD" autoCapitalize="characters" />
      </Field>
      <Field label="Description (optional)">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nasdaq-100 2x" />
      </Field>
      <Field label="Group" hint="Buy rules for this group are linked to the ticker.">
        <Segmented value={group} onChange={setGroup} options={TICKER_GROUPS.map((g) => ({ value: g, label: groupLabel(g) }))} />
      </Field>
      <Field label="Currency">
        <Segmented
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'USD', label: 'USD' },
            { value: 'KRW', label: 'KRW' },
          ]}
        />
      </Field>
      <Field label="Account">
        <Segmented
          value={account}
          onChange={setAccount}
          options={[
            { value: '직투', label: accountLabel('직투') },
            { value: 'ISA', label: 'ISA' },
          ]}
        />
      </Field>
      <button className="btn primary block" disabled={!symbol.trim()} onClick={save}>
        Save
      </button>
      {old && (
        <button className="btn ghost danger-text block" onClick={() => setAsk(true)}>
          Delete ticker
        </button>
      )}
      {old && ask && used && (
        <ConfirmSheet
          title="Can't delete this ticker"
          description={`There are plans for ${old.symbol}. The ticker has to stay so past plans and records still make sense.`}
          onClose={() => setAsk(false)}
        />
      )}
      {old && ask && !used && (
        <ConfirmSheet
          title={`Delete ${old.symbol}`}
          description="No plans use this ticker, so it's removed right away."
          confirmLabel="Delete"
          danger
          onClose={() => setAsk(false)}
          onConfirm={() => {
            deleteTicker(old.id);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

/* ───────── Rules ───────── */

export function RulesPage() {
  const s = useAppState();
  const nav = useNav();
  const [editChecks, setEditChecks] = useState(false);
  const [checksText, setChecksText] = useState('');
  const [reorder, setReorder] = useState(false);

  // 저장된 그룹 순서대로, 규칙이 있는 그룹만
  const present = [...new Set(s.rules.map((r) => r.group))];
  const groups = [...s.settings.ruleGroupOrder.filter((g) => present.includes(g)), ...present.filter((g) => !s.settings.ruleGroupOrder.includes(g))];

  return (
    <Page
      title="Buy rules"
      back="Back"
      right={
        reorder ? (
          <button className="link" onClick={() => setReorder(false)}>
            Done
          </button>
        ) : (
          <button className="link" onClick={() => nav.push({ name: 'ruleForm' })}>
            Add
          </button>
        )
      }
    >
      {reorder ? (
        <p className="muted small">Move groups and rules with the arrows. The order is also used when you pick a rule for a new plan.</p>
      ) : (
        <div className="row between gap">
          <p className="muted small">Changing how a rule buys, or deleting it, needs a reason. Renaming doesn't.</p>
          <button className="btn ghost sm" onClick={() => setReorder(true)}>
            Edit order
          </button>
        </div>
      )}
      {groups.map((g, gi) => {
        const rules = s.rules.filter((r) => r.group === g);
        return (
          <section key={g}>
            <div className="section-row">
              <h3 className="section-title">{ruleGroupLabel(g)}</h3>
              {reorder && (
                <MoveButtons
                  label={ruleGroupLabel(g)}
                  onUp={gi > 0 ? () => moveRuleGroup(g, -1, groups) : undefined}
                  onDown={gi < groups.length - 1 ? () => moveRuleGroup(g, 1, groups) : undefined}
                />
              )}
            </div>
            <nav className="menu card">
              {rules.map((r, i) =>
                reorder ? (
                  <div key={r.id} className="menu-row">
                    <span>{r.name}</span>
                    <MoveButtons
                      label={r.name}
                      onUp={i > 0 ? () => moveRule(r.id, -1) : undefined}
                      onDown={i < rules.length - 1 ? () => moveRule(r.id, 1) : undefined}
                    />
                  </div>
                ) : (
                  <button key={r.id} onClick={() => nav.push({ name: 'ruleForm', id: r.id })}>
                    <span>{r.name}</span>
                    <span className="muted small">{ruleText(r)} ›</span>
                  </button>
                ),
              )}
            </nav>
          </section>
        );
      })}

      <h3 className="section-title">Checklist before each plan</h3>
      <section className="card">
        <ul className="plain">
          {s.commonChecks.map((c, i) => (
            <li key={i}>☐ {c}</li>
          ))}
        </ul>
        <button
          className="btn ghost"
          onClick={() => {
            setChecksText(s.commonChecks.join('\n'));
            setEditChecks(true);
          }}
        >
          Edit checklist
        </button>
      </section>

      {editChecks && (
        <ReasonSheet
          title="Edit checklist"
          description="One rule per line."
          confirmLabel="Save"
          onClose={() => setEditChecks(false)}
          onConfirm={(reason) => {
            saveCommonChecks(
              checksText
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
              reason,
            );
            setEditChecks(false);
          }}
        >
          <textarea className="block" rows={6} value={checksText} onChange={(e) => setChecksText(e.target.value)} />
        </ReasonSheet>
      )}
    </Page>
  );
}

export function RuleFormPage({ id }: { id?: string }) {
  const s = useAppState();
  const nav = useNav();
  const old = s.rules.find((r) => r.id === id);
  const [name, setName] = useState(old?.name ?? '');
  const [group, setGroup] = useState<RuleGroup>(old?.group ?? 'ETF');
  const [type, setType] = useState<RuleType>(old?.type ?? 'split');
  const [percent, setPercent] = useState(old ? String(old.percent) : '');
  const [days, setDays] = useState(old ? String(old.days || 5) : '5');
  const [shares, setShares] = useState(old ? String(old.sharesPerDay || 1) : '1');
  const [note, setNote] = useState(old?.note ?? '');
  const [sheet, setSheet] = useState<'save' | 'delete' | null>(null);

  const draft: Rule = {
    id: old?.id ?? uid(),
    name: name.trim(),
    group,
    type,
    percent: type === 'fixed' ? 0 : parseNum(percent),
    days: type === 'split' ? Math.floor(parseNum(days)) : 0,
    sharesPerDay: type === 'fixed' ? Math.floor(parseNum(shares)) : 0,
    // 고치지 않은 메모는 그대로 두어야 '이름만 바뀜'을 바르게 알아본다
    note: old && note.trim() === old.note.trim() ? old.note : note.trim(),
  };
  const valid =
    !!draft.name &&
    (type === 'fixed' ? draft.sharesPerDay > 0 : draft.percent > 0 && draft.percent <= 100) &&
    (type !== 'split' || draft.days >= 1);

  const unchanged = !!old && JSON.stringify(old) === JSON.stringify(draft);

  function onSave() {
    // 새 규칙, 바뀐 게 없음, 이름만 바꿈 → 이유 없이 저장
    if (!old || unchanged || onlyRenamed(old, draft)) {
      if (!unchanged) saveRule(draft, null);
      nav.pop();
    } else setSheet('save');
  }

  return (
    <Page title={old ? 'Edit rule' : 'Add rule'} back="Cancel">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="100-day MA touch" />
      </Field>
      <Field label="Group" hint={RULE_GROUP_HINT[group]}>
        <Segmented
          value={group}
          onChange={setGroup}
          options={(RULE_GROUPS.includes(group) ? RULE_GROUPS : [...RULE_GROUPS, group]).map((g) => ({ value: g, label: ruleGroupLabel(g) }))}
        />
      </Field>
      <Field label="Type">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'split', label: 'Scale-in' },
            { value: 'signal', label: '% / signal' },
            { value: 'fixed', label: 'Shares / signal' },
          ]}
        />
      </Field>
      {type !== 'fixed' && (
        <Field label="% of cash">
          <NumInput value={percent} onChange={setPercent} suffix="%" />
        </Field>
      )}
      {type === 'split' && (
        <Field label="Spread over" hint={valid ? ruleText(draft) : undefined}>
          <NumInput value={days} onChange={setDays} suffix="days" decimal={false} />
        </Field>
      )}
      {type === 'fixed' && (
        <Field label="Shares per buy">
          <NumInput value={shares} onChange={setShares} suffix="shares" decimal={false} />
        </Field>
      )}
      <Field label="Note / preconditions (optional)">
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="btn primary block" disabled={!valid} onClick={onSave}>
        Save
      </button>
      {old && (
        <button className="btn ghost danger-text block" onClick={() => setSheet('delete')}>
          Delete rule
        </button>
      )}
      {sheet === 'save' && (
        <ReasonSheet
          title="Edit rule"
          description="Plans you've already started won't change."
          confirmLabel="Save"
          onClose={() => setSheet(null)}
          onConfirm={(reason) => {
            saveRule(draft, reason);
            nav.pop();
          }}
        />
      )}
      {sheet === 'delete' && (
        <ReasonSheet
          title="Delete rule"
          confirmLabel="Delete"
          danger
          onClose={() => setSheet(null)}
          onConfirm={(reason) => {
            deleteRule(old!.id, reason);
            nav.pop();
          }}
        />
      )}
    </Page>
  );
}

/* ───────── Unplanned buy ───────── */

export function OffRulePage() {
  const s = useAppState();
  const nav = useNav();
  const [tid, setTid] = useState<string | undefined>();
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const t = s.tickers.find((x) => x.id === tid);
  const q = parseNum(qty);
  const ok = !!t && Number.isInteger(q) && q > 0 && reason.trim().length >= MIN_REASON;

  return (
    <Page title="Unplanned buy" back="Cancel">
      <p className="muted small">Log buys outside your rules too, don't hide them. They count toward your rule score, and you'll read these reasons again later.</p>
      <Field label="Ticker">
        <div className="chips">
          {s.tickers.map((x) => (
            <button key={x.id} className={'chip' + (x.id === tid ? ' on' : '')} onClick={() => setTid(x.id)}>
              {x.symbol}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Shares">
        <NumInput value={qty} onChange={setQty} suffix="shares" decimal={false} />
      </Field>
      <Field label="Fill price (optional)">
        <NumInput value={price} onChange={setPrice} suffix={t?.currency === 'KRW' ? '₩' : '$'} />
      </Field>
      <Field label="Reason">
        <ReasonInput value={reason} onChange={setReason} placeholder="Why did you buy outside your rules?" />
      </Field>
      <button
        className="btn danger block"
        disabled={!ok}
        onClick={() => {
          const p = parseNum(price);
          addOffRule(t!, q, p > 0 ? p : null, reason);
          nav.pop();
        }}
      >
        Log it
      </button>
    </Page>
  );
}

/* ───────── Savings (BOXX) ───────── */

export function SavingsPage() {
  const s = useAppState();
  const symbol = s.settings.savingsSymbol;
  const [date, setDate] = useState(todayStr());
  const [qty, setQty] = useState('3');
  const [krw, setKrw] = useState('');
  const [target, setTarget] = useState(String(s.settings.savingsTarget));
  const [delId, setDelId] = useState<string | null>(null);
  const total = s.savings.reduce((a, x) => a + x.qty, 0);
  const totalKrw = s.savings.reduce((a, x) => a + x.krw, 0);
  const goal = s.settings.savingsTarget;
  const q = parseNum(qty);

  return (
    <Page title={`${symbol} savings`} back="Back">
      <section className="card">
        <div className="row between">
          <span className="big-num">
            {total}
            <small className="muted"> / {sharesText(goal)}</small>
          </span>
          <span className="muted small">{fmtMoney(totalKrw, 'KRW')}</span>
        </div>
        <Bar value={goal ? total / goal : 0} />
        <p className="muted small">
          Money kept out of regular buys. Use it only on a 100-week MA touch (200-week if possible), then refill it by rebalancing.
        </p>
      </section>

      <h3 className="section-title">Add a deposit</h3>
      <section className="card">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="row gap">
          <Field label="Shares">
            <NumInput value={qty} onChange={setQty} suffix="shares" decimal={false} />
          </Field>
          <Field label="KRW amount (optional)">
            <NumInput value={krw} onChange={setKrw} suffix="₩" />
          </Field>
        </div>
        <button
          className="btn primary block"
          disabled={!(Number.isInteger(q) && q > 0) || !date}
          onClick={() => {
            addSaving({ date, symbol, qty: q, krw: parseNum(krw) || 0 });
            setKrw('');
          }}
        >
          Add
        </button>
      </section>

      <h3 className="section-title">History</h3>
      {s.savings.length === 0 ? (
        <Empty>No deposits yet.</Empty>
      ) : (
        <nav className="menu card">
          {[...s.savings]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((x) => (
              <div key={x.id} className="menu-row">
                <span>
                  {fmtDay(x.date)} <span className="muted small">{x.date.slice(0, 4)}</span>
                </span>
                <span>
                  {sharesText(x.qty)} {x.krw > 0 && <span className="muted small">{fmtMoney(x.krw, 'KRW')}</span>}{' '}
                  <button className="link small danger-text" onClick={() => setDelId(x.id)}>
                    Delete
                  </button>
                </span>
              </div>
            ))}
        </nav>
      )}

      <h3 className="section-title">Goal</h3>
      <section className="card row gap">
        <NumInput value={target} onChange={setTarget} suffix="shares" decimal={false} />
        <button
          className="btn ghost"
          disabled={!(parseNum(target) > 0) || parseNum(target) === goal}
          onClick={() => setSavingsTarget(Math.floor(parseNum(target)))}
        >
          Save
        </button>
      </section>

      {delId && (
        <ConfirmSheet
          title="Delete deposit"
          description="Remove this deposit from your history?"
          confirmLabel="Delete"
          danger
          onClose={() => setDelId(null)}
          onConfirm={() => {
            deleteSaving(delId);
            setDelId(null);
          }}
        />
      )}
    </Page>
  );
}

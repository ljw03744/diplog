import { useEffect, useState, type ReactNode } from 'react';
import { MIN_REASON } from './actions';
import { IconBack } from './icons';
import { useNav } from './nav';
import type { TickerGroup } from './types';

export function Page({
  title,
  children,
  right,
  back = 'Close',
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  back?: string;
}) {
  const nav = useNav();
  return (
    <div className="page">
      <header className="page-head">
        <button className="link" onClick={nav.pop} aria-label={back}>
          {back === 'Back' ? <IconBack /> : back}
        </button>
        <h1>{title}</h1>
        <div className="page-head-right">{right}</div>
      </header>
      <div className="page-body">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs */
export function UnderlineTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="utabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Ticker circle, colored by group */
export function Logo({ symbol, group }: { symbol?: string; group?: TickerGroup }) {
  const text = (symbol ?? '?').slice(0, 4);
  return (
    <span className={'logo' + (group ? ` g-${group}` : '')} style={text.length > 3 ? { fontSize: 10 } : undefined} aria-hidden>
      {text}
    </span>
  );
}

/** Progress bar (0 to 1) */
export function Bar({ value, thin }: { value: number; thin?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={'bar' + (thin ? ' thin' : '')} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
  suffix,
  decimal = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  decimal?: boolean;
}) {
  return (
    <div className="num">
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </div>
  );
}

export function ReasonInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const len = value.trim().length;
  return (
    <div className="reason">
      <textarea
        rows={3}
        value={value}
        placeholder={placeholder ?? "Why are you going off your rules? You'll read this again later."}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={'reason-count' + (len >= MIN_REASON ? ' ok' : '')}>
        {len >= MIN_REASON ? "Goes into your log · can't be deleted" : `${MIN_REASON - len} more characters`}
      </div>
    </div>
  );
}

/** 아래에서 올라오는 확인 창. 이유를 적어야 확인 버튼이 켜진다. */
export function ReasonSheet({
  title,
  description,
  children,
  confirmLabel,
  danger,
  extraValid = true,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  extraValid?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= MIN_REASON && extraValid;
  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
      <Field label="Reason">
        <ReasonInput value={reason} onChange={setReason} />
      </Field>
      <div className="row gap">
        <button className="btn ghost grow" onClick={onClose}>
          Cancel
        </button>
        <button className={'btn grow ' + (danger ? 'danger' : 'primary')} disabled={!ok} onClick={() => onConfirm(reason)}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * 앱 안에서 띄우는 확인 창. 브라우저의 confirm()은 환경에 따라 창을 띄우지 않고
 * 바로 false를 돌려주기도 해서 쓰지 않는다.
 */
export function ConfirmSheet({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  /** 없으면 '확인' 버튼만 있는 안내 창 */
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <h2 className="sheet-title">{title}</h2>
      {description && <p className="muted">{description}</p>}
      <div className="row gap">
        {confirmLabel && onConfirm ? (
          <>
            <button className="btn ghost grow" onClick={onClose}>
              Cancel
            </button>
            <button className={'btn grow ' + (danger ? 'danger' : 'primary')} onClick={onConfirm}>
              {confirmLabel}
            </button>
          </>
        ) : (
          <button className="btn primary grow" onClick={onClose}>
            OK
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

import { useRef, useState } from 'react';
import { markBackedUp } from '../actions';
import { useNav } from '../nav';
import { getState, replaceState, useAppState, validate } from '../store';
import type { AppState } from '../types';
import { ConfirmSheet } from '../ui';
import { fmtDateTime, shareOrDownload, todayStr } from '../util';

async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const s = getState();
  const json = JSON.stringify({ ...s, exportedAt: new Date().toISOString() }, null, 2);
  const name = `diplog-backup-${todayStr()}.json`;
  // iPhone: the share sheet → "Save to Files" is the most reliable path.
  return shareOrDownload(new File([json], name, { type: 'application/json' }));
}

export function SettingsTab() {
  const s = useAppState();
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<AppState | null>(null);

  async function onExport() {
    const r = await exportBackup();
    if (r === 'cancelled') return;
    markBackedUp();
    setMsg(r === 'shared' ? 'Backup sent. Check that it was saved in Files.' : 'Backup downloaded.');
  }

  async function onImport(f: File | undefined) {
    if (!f) return;
    try {
      const data = validate(JSON.parse(await f.text()));
      if (!data) {
        setMsg("That isn't a DipLog backup file.");
        return;
      }
      setPending(data);
    } catch {
      setMsg("Couldn't read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="tab">
      <header className="tab-head">
        <h1>Settings</h1>
      </header>

      <h3 className="section-title">Backup</h3>
      <section className="card">
        <p className="muted small">
          Your data lives only on this phone. It's gone if you switch phones or clear Safari data, so export a backup regularly.
        </p>
        <div className="muted small">Last backup: {s.settings.lastBackupAt ? fmtDateTime(s.settings.lastBackupAt) : 'never'}</div>
        <div className="row gap">
          <button className="btn primary grow" onClick={onExport}>
            Export JSON
          </button>
          <button className="btn ghost grow" onClick={() => fileRef.current?.click()}>
            Import
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        {msg && <div className="toast-inline">{msg}</div>}
      </section>

      <h3 className="section-title">Manage</h3>
      <nav className="menu card">
        <button onClick={() => nav.push({ name: 'rules' })}>
          Buy rules <span className="muted">{s.rules.length} ›</span>
        </button>
        <button onClick={() => nav.push({ name: 'tickers' })}>
          Tickers <span className="muted">{s.tickers.length} ›</span>
        </button>
        <button onClick={() => nav.push({ name: 'savings' })}>
          {s.settings.savingsSymbol} savings <span className="muted">›</span>
        </button>
      </nav>

      <p className="muted small center">DipLog · Buy by your rules. When you break one, write down why.</p>

      {pending && (
        <ConfirmSheet
          title="Restore backup"
          description={`All current data will be replaced with the backup. (Backup: ${pending.plans.length} plans, ${pending.logs.length} log entries)`}
          confirmLabel="Replace"
          danger
          onClose={() => setPending(null)}
          onConfirm={() => {
            replaceState(pending);
            setPending(null);
            setMsg('Backup restored.');
          }}
        />
      )}
    </div>
  );
}

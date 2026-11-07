import { useRef, useState } from 'react';
import { markBackedUp } from '../actions';
import { useNav } from '../nav';
import { getState, replaceState, useAppState, validate } from '../store';
import type { AppState } from '../types';
import { ConfirmSheet } from '../ui';
import { fmtDateTime, todayStr } from '../util';

async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const s = getState();
  const json = JSON.stringify({ ...s, exportedAt: new Date().toISOString() }, null, 2);
  const name = `diplog-backup-${todayStr()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  // iPhone: 공유 시트 → '파일에 저장'이 가장 확실하다.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // 공유가 막혔으면 다운로드로 넘어간다
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
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
    setMsg(r === 'shared' ? '백업 파일을 보냈습니다. 파일 앱에 저장되었는지 확인하세요.' : '백업 파일을 내려받았습니다.');
  }

  async function onImport(f: File | undefined) {
    if (!f) return;
    try {
      const data = validate(JSON.parse(await f.text()));
      if (!data) {
        setMsg('DipLog 백업 파일이 아닙니다.');
        return;
      }
      setPending(data);
    } catch {
      setMsg('파일을 읽지 못했습니다.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="tab">
      <header className="tab-head">
        <h1>설정</h1>
      </header>

      <h3 className="section-title">백업</h3>
      <section className="card">
        <p className="muted small">
          데이터는 이 폰에만 저장됩니다. 폰을 바꾸거나 Safari 데이터를 지우면 사라지니, 주기적으로 내보내 두세요.
        </p>
        <div className="muted small">
          마지막 백업: {s.settings.lastBackupAt ? fmtDateTime(s.settings.lastBackupAt) : '없음'}
        </div>
        <div className="row gap">
          <button className="btn primary grow" onClick={onExport}>
            JSON 내보내기
          </button>
          <button className="btn ghost grow" onClick={() => fileRef.current?.click()}>
            가져오기
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        {msg && <div className="toast-inline">{msg}</div>}
      </section>

      <h3 className="section-title">관리</h3>
      <nav className="menu card">
        <button onClick={() => nav.push({ name: 'rules' })}>
          매수 규칙 <span className="muted">{s.rules.length}개 ›</span>
        </button>
        <button onClick={() => nav.push({ name: 'tickers' })}>
          종목 <span className="muted">{s.tickers.length}개 ›</span>
        </button>
        <button onClick={() => nav.push({ name: 'savings' })}>
          {s.settings.savingsSymbol} 적립 <span className="muted">›</span>
        </button>
      </nav>

      <p className="muted small center">DipLog · 규칙대로 사고, 벗어나면 이유를 남긴다.</p>

      {pending && (
        <ConfirmSheet
          title="백업 불러오기"
          description={`지금 데이터가 백업 파일 내용으로 모두 바뀝니다. (백업: 일정 ${pending.plans.length}개, 기록 ${pending.logs.length}개)`}
          confirmLabel="바꾸기"
          danger
          onClose={() => setPending(null)}
          onConfirm={() => {
            replaceState(pending);
            setPending(null);
            setMsg('백업을 불러왔습니다.');
          }}
        />
      )}
    </div>
  );
}

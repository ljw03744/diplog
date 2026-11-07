import { useSyncExternalStore } from 'react';
import { initialState } from './defaults';
import type { AppState } from './types';

const KEY = 'diplog:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = validate(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    /* 저장소를 못 쓰면 기본값으로 시작 */
  }
  return initialState();
}

let state: AppState = load();
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(update: (s: AppState) => AppState): void {
  state = update(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    alert('저장하지 못했습니다. 저장 공간을 확인하고, 설정에서 백업을 내보내 두세요.');
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** 가져온 JSON이 DipLog 백업 형식인지 확인. 아니면 null */
export function validate(data: unknown): AppState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<AppState>;
  if (d.version !== 1) return null;
  const arrays = ['tickers', 'rules', 'commonChecks', 'plans', 'logs', 'savings'] as const;
  if (!arrays.every((k) => Array.isArray(d[k]))) return null;
  if (!d.settings || typeof d.settings !== 'object') return null;
  const base = initialState();
  return { ...base, ...d, settings: { ...base.settings, ...d.settings } } as AppState;
}

export function replaceState(next: AppState): void {
  setState(() => next);
}

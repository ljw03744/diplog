import { useCallback, useMemo, useState } from 'react';
import { NavContext, type Nav, type Route } from './nav';
import { LogsTab } from './pages/Logs';
import { OffRulePage, RuleFormPage, RulesPage, SavingsPage, TickerFormPage, TickersPage } from './pages/Manage';
import { NewPlanPage } from './pages/NewPlan';
import { PlanDetailPage } from './pages/PlanDetail';
import { SettingsTab } from './pages/Settings';
import { TodayTab } from './pages/Today';
import { useAppState } from './store';
import { Sheet } from './ui';

type Tab = 'today' | 'logs' | 'settings';

function renderRoute(r: Route) {
  switch (r.name) {
    case 'newPlan':
      return <NewPlanPage tickerId={r.tickerId} />;
    case 'plan':
      return <PlanDetailPage id={r.id} />;
    case 'tickers':
      return <TickersPage />;
    case 'tickerForm':
      return <TickerFormPage id={r.id} />;
    case 'rules':
      return <RulesPage />;
    case 'ruleForm':
      return <RuleFormPage id={r.id} />;
    case 'offRule':
      return <OffRulePage />;
    case 'savings':
      return <SavingsPage />;
  }
}

export function App() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>('today');
  const [stack, setStack] = useState<Route[]>([]);
  const [menu, setMenu] = useState(false);

  const push = useCallback((r: Route) => {
    setMenu(false);
    setStack((st) => [...st, r]);
  }, []);
  const pop = useCallback(() => setStack((st) => st.slice(0, -1)), []);
  const reset = useCallback(() => {
    setStack([]);
    setTab('today');
  }, []);
  const nav: Nav = useMemo(() => ({ push, pop, reset }), [push, pop, reset]);
  const closeMenu = useCallback(() => setMenu(false), []);

  const activeCount = s.plans.filter((p) => p.status === 'active').length;
  const top = stack[stack.length - 1];

  return (
    <NavContext.Provider value={nav}>
      <div className="app" aria-hidden={!!top}>
        <main>
          {tab === 'today' && <TodayTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>

        <button className="fab" aria-label="추가" onClick={() => setMenu(true)}>
          ＋
        </button>

        <nav className="tabbar">
          <TabButton on={tab === 'today'} onClick={() => setTab('today')} icon="◉" label="오늘" badge={activeCount} />
          <TabButton on={tab === 'logs'} onClick={() => setTab('logs')} icon="✎" label="기록" />
          <TabButton on={tab === 'settings'} onClick={() => setTab('settings')} icon="⚙" label="설정" />
        </nav>
      </div>

      {stack.map((r, i) => (
        <div key={i} className="layer" style={{ zIndex: 20 + i }} hidden={i !== stack.length - 1}>
          {renderRoute(r)}
        </div>
      ))}

      {menu && (
        <Sheet onClose={closeMenu}>
          <div className="menu-sheet">
            <button className="menu-main" onClick={() => push({ name: 'newPlan' })}>
              <b>매매 일정 추가</b>
              <span className="muted small">씨드를 넣으면 살 수량을 알려 줍니다</span>
            </button>
            <button onClick={() => push({ name: 'offRule' })}>규칙 외 매수 기록</button>
            <button onClick={() => push({ name: 'savings' })}>{s.settings.savingsSymbol} 적립 기록</button>
            <button onClick={() => push({ name: 'tickerForm' })}>종목 추가</button>
            <button onClick={() => push({ name: 'rules' })}>규칙 보기 · 수정</button>
          </div>
          <button className="btn ghost block" onClick={closeMenu}>
            닫기
          </button>
        </Sheet>
      )}
    </NavContext.Provider>
  );
}

function TabButton({ on, onClick, icon, label, badge }: { on: boolean; onClick: () => void; icon: string; label: string; badge?: number }) {
  return (
    <button className={'tabbtn' + (on ? ' on' : '')} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <span className="tabicon" aria-hidden>
        {icon}
        {!!badge && <span className="badge">{badge}</span>}
      </span>
      <span>{label}</span>
    </button>
  );
}

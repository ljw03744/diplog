import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavContext, type Nav, type Route } from './nav';
import { LogsTab } from './pages/Logs';
import { OffRulePage, RuleFormPage, RulesPage, SavingsPage, TickerFormPage, TickersPage } from './pages/Manage';
import { NewPlanPage } from './pages/NewPlan';
import { PlanDetailPage } from './pages/PlanDetail';
import { fxIsStale, PortfolioTab } from './pages/Portfolio';
import { SettingsTab } from './pages/Settings';
import { TodayTab } from './pages/Today';
import { useAppState } from './store';
import { IconLog, IconPie, IconPlus, IconSettings, IconToday } from './icons';
import { Sheet } from './ui';

type Tab = 'today' | 'portfolio' | 'logs' | 'settings';

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
          {tab === 'portfolio' && <PortfolioTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>

        <button className="fab" aria-label="Add" onClick={() => setMenu(true)}>
          <IconPlus />
        </button>

        <nav className="tabbar">
          <TabButton on={tab === 'today'} onClick={() => setTab('today')} icon={<IconToday />} label="Today" badge={activeCount} />
          <TabButton
            on={tab === 'portfolio'}
            onClick={() => setTab('portfolio')}
            icon={<IconPie />}
            label="Portfolio"
            dot={fxIsStale(s) ? 'Exchange rate needs an update' : undefined}
          />
          <TabButton on={tab === 'logs'} onClick={() => setTab('logs')} icon={<IconLog />} label="Log" />
          <TabButton on={tab === 'settings'} onClick={() => setTab('settings')} icon={<IconSettings />} label="Settings" />
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
              <b>New buy plan</b>
              <span className="muted small">Pick a signal and see how much to buy</span>
            </button>
            <button onClick={() => push({ name: 'offRule' })}>Log an unplanned buy</button>
            <button onClick={() => push({ name: 'savings' })}>{s.settings.savingsSymbol} savings deposit</button>
            <button onClick={() => push({ name: 'tickerForm' })}>Add ticker</button>
            <button onClick={() => push({ name: 'rules' })}>View or edit rules</button>
          </div>
          <button className="btn ghost block" onClick={closeMenu}>
            Close
          </button>
        </Sheet>
      )}
    </NavContext.Provider>
  );
}

function TabButton({
  on,
  onClick,
  icon,
  label,
  badge,
  dot,
}: {
  on: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
  /** 알림 점. 값은 화면 낭독기용 설명 */
  dot?: string;
}) {
  return (
    <button className={'tabbtn' + (on ? ' on' : '')} onClick={onClick} aria-current={on ? 'page' : undefined} aria-label={dot ? `${label}, ${dot}` : undefined}>
      <span className="tabicon" aria-hidden>
        {icon}
        {!!badge && <span className="badge">{badge}</span>}
        {dot && !badge && <span className="badge dot" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

import { createContext, useContext } from 'react';

export type Route =
  | { name: 'newPlan'; tickerId?: string }
  | { name: 'plan'; id: string }
  | { name: 'tickers' }
  | { name: 'tickerForm'; id?: string }
  | { name: 'rules' }
  | { name: 'ruleForm'; id?: string }
  | { name: 'offRule' }
  | { name: 'savings' };

export interface Nav {
  push: (r: Route) => void;
  pop: () => void;
  /** 쌓인 화면을 모두 닫고 첫 화면으로 */
  reset: () => void;
}

export const NavContext = createContext<Nav>({ push: () => {}, pop: () => {}, reset: () => {} });

export function useNav(): Nav {
  return useContext(NavContext);
}

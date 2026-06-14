'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { DashboardState } from '../types';

interface AppStateCtx {
  state: DashboardState | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppStateCtx | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DashboardState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      setState(await r.json());
    } catch {
      /* keep last good state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  return <Ctx.Provider value={{ state, refresh }}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAppState outside AppStateProvider');
  return c;
}

/** Treasury cap/remaining — single source used across topbar, report, settings.
 *  Cap/remaining come purely from the on-chain root delegation; before any grant
 *  there is no treasury authority (0). No config/preset fallback. */
export function treasuryView(state: DashboardState) {
  const root = state.delegations.find((d) => d.parentId === null);
  const cap = root ? state.treasury.capUsdc : 0;
  const remaining = root ? state.treasury.remainingUsdc : 0;
  return { root, cap, remaining, spent: Math.max(0, cap - remaining) };
}

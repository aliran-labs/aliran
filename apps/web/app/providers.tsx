'use client';

import { WalletProvider } from './lib/wallet';
import { AppStateProvider } from './lib/appState';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AppStateProvider>{children}</AppStateProvider>
    </WalletProvider>
  );
}

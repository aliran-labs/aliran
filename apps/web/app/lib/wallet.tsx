'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const BASE_SEPOLIA = 84532;
const BASE_SEPOLIA_HEX = '0x14a34';

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (e: string, cb: (...a: any[]) => void) => void;
  removeListener?: (e: string, cb: (...a: any[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Eth;
  }
}

interface WalletCtx {
  available: boolean;
  account: string | null;
  chainId: number | null;
  isBaseSepolia: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  switchToBaseSepolia: () => Promise<void>;
  signTypedData: (typedData: unknown) => Promise<string>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    setAvailable(true);
    // restore existing connection silently
    eth.request({ method: 'eth_accounts' }).then((a: string[]) => setAccount(a?.[0] ?? null)).catch(() => {});
    eth.request({ method: 'eth_chainId' }).then((c: string) => setChainId(parseInt(c, 16))).catch(() => {});
    const onAcc = (a: string[]) => setAccount(a?.[0] ?? null);
    const onChain = (c: string) => setChainId(parseInt(c, 16));
    eth.on?.('accountsChanged', onAcc);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAcc);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    setConnecting(true);
    try {
      const a: string[] = await eth.request({ method: 'eth_requestAccounts' });
      setAccount(a?.[0] ?? null);
      const c: string = await eth.request({ method: 'eth_chainId' });
      setChainId(parseInt(c, 16));
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToBaseSepolia = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA_HEX }] });
    } catch (e: any) {
      // 4902 = chain not added → add it
      if (e?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: BASE_SEPOLIA_HEX,
              chainName: 'Base Sepolia',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }, []);

  const signTypedData = useCallback(
    async (typedData: unknown): Promise<string> => {
      const eth = window.ethereum;
      if (!eth || !account) throw new Error('wallet not connected');
      return eth.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(typedData)] });
    },
    [account],
  );

  return (
    <Ctx.Provider
      value={{
        available,
        account,
        chainId,
        isBaseSepolia: chainId === BASE_SEPOLIA,
        connecting,
        connect,
        switchToBaseSepolia,
        signTypedData,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWallet outside WalletProvider');
  return c;
}

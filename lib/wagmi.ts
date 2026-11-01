import { createConfig, injected } from 'wagmi';
import { coinbaseWallet, walletConnect } from 'wagmi/connectors';
import { mainnet } from 'wagmi/chains';
import { rpcTransport } from './reserve';

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// WalletConnect is always listed; without NEXT_PUBLIC_WC_PROJECT_ID its row is disabled.
export const WALLETS = [
  { id: 'metaMask', name: 'MetaMask', kind: 'BROWSER', ready: true },
  { id: 'walletConnect', name: 'WalletConnect', kind: 'QR', ready: !!wcProjectId },
  { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', kind: 'APP', ready: true },
] as const;

export const wagmiConfig = createConfig({
  chains: [mainnet],
  ssr: true,
  multiInjectedProviderDiscovery: false,
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({ appName: 'DiversiFi', appLogoUrl: 'https://diversifi.tech/app-icon-512.png' }),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true, metadata: { name: 'DiversiFi', description: 'Mint and redeem DFiUSD', url: 'https://diversifi.tech', icons: [] } })] : []),
  ],
  transports: { [mainnet.id]: rpcTransport },
});

declare module 'wagmi' {
  interface Register { config: typeof wagmiConfig }
}

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum mainnet', 10: 'OP Mainnet', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum One', 43114: 'Avalanche', 11155111: 'Sepolia',
};

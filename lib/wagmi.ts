import { createConfig, http, injected } from 'wagmi';
import { coinbaseWallet, mock, walletConnect } from 'wagmi/connectors';
import { mainnet } from 'wagmi/chains';
import { rpcTransport } from './reserve';

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// Dev only: /app?preview=0x… connects a read-only mock wallet for that address, to see the connected
// screens with real balances. It cannot sign. Stripped from production builds by the NODE_ENV check.
// Dev only: add &fork=1 to send every chain call to a local Anvil copy of mainnet (localhost:8545) instead, so the
// preview wallet can really sign and swap with test money. Never active in production builds.
export const FORK =
  process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fork');
const chain = FORK ? { ...mainnet, rpcUrls: { default: { http: ['http://localhost:8545'] } } } : mainnet;

export const PREVIEW_ADDR =
  process.env.NODE_ENV === 'development' && typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('preview') as `0x${string}` | null)
    : null;

// WalletConnect is listed last and always looks available. Until NEXT_PUBLIC_WC_PROJECT_ID is set it has no
// connector, and choosing it shows a short notice instead of connecting.
export const WALLETS = [
  { id: 'metaMask', name: 'MetaMask', kind: 'BROWSER' },
  { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', kind: 'APP' },
  { id: 'walletConnect', name: 'WalletConnect', kind: 'QR' },
] as const;

export const wagmiConfig = createConfig({
  chains: [chain],
  ssr: true,
  multiInjectedProviderDiscovery: false,
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({ appName: 'DiversiFi', appLogoUrl: 'https://diversifi.tech/app-icon-512.png' }),
    ...(PREVIEW_ADDR ? [mock({ accounts: [PREVIEW_ADDR] })] : []),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true, metadata: { name: 'DiversiFi', description: 'Mint and redeem DFiUSD', url: 'https://diversifi.tech', icons: [] } })] : []),
  ],
  transports: { [mainnet.id]: FORK ? http('http://localhost:8545') : rpcTransport },
});

declare module 'wagmi' {
  interface Register { config: typeof wagmiConfig }
}

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum mainnet', 10: 'OP Mainnet', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum One', 43114: 'Avalanche', 11155111: 'Sepolia',
};

// Fixed coin order and colours. Never reorder: the brand pins this sequence.
export type Ticker = 'USDC' | 'DAI' | 'USDS' | 'USDT' | 'GHO' | 'FDUSD' | 'frxUSD';

export type Coin = {
  t: Ticker;
  /** Target share in percent at the 30 Oct 2026 allocation. Used until the chain read lands. */
  s: number;
  color: string;
  issuer: string;
  address: `0x${string}`;
  decimals: number;
};

export const COINS: Coin[] = [
  { t: 'USDC', s: 30, color: 'var(--usdc)', issuer: 'Circle', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  { t: 'DAI', s: 15, color: 'var(--dai)', issuer: 'Sky', address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18 },
  { t: 'USDS', s: 15, color: 'var(--usds)', issuer: 'Sky', address: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', decimals: 18 },
  { t: 'USDT', s: 10, color: 'var(--usdt)', issuer: 'Tether', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
  { t: 'GHO', s: 10, color: 'var(--gho)', issuer: 'Aave', address: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f', decimals: 18 },
  { t: 'FDUSD', s: 10, color: 'var(--fdusd)', issuer: 'First Digital', address: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18 },
  { t: 'frxUSD', s: 10, color: 'var(--frxusd)', issuer: 'Frax', address: '0xcacd6fd266af91b8aed52accc382b4e165586e29', decimals: 18 },
];

export const RM_ADDR = '0x8978F3A0227453Dd0821bC8A85e4bEF96DAF8327' as const;
export const TOKEN_ADDR = '0xDF100b8ABd3cd41fC5cC1236AD7c6629A901AfBf' as const;
export const DEPLOY_TX = '0x238261145dca828c5b7ecdce77975a4f66faf8ae38a2b91f803063675468e8d3';
/** Block DFiUSD was deployed in (Sourcify). Wallet history starts here. */
export const DEPLOY_BLOCK = 23_343_879;
/** ReserveManagerHelpers: exact quoteMint / quoteBurn amounts (Sourcify exact match). */
export const HELPERS_ADDR = '0x3E706f1D975BF76e259939Bd741C36A88A6F0D13' as const;

export const ETHERSCAN = 'https://etherscan.io';
export const rmUrl = `${ETHERSCAN}/address/${RM_ADDR}`;
export const tokenUrl = `${ETHERSCAN}/token/${TOKEN_ADDR}`;
export const coinUrl = (c: Coin) => `${ETHERSCAN}/token/${c.address}?a=${RM_ADDR}`;
export const txUrl = (hash: string) => `${ETHERSCAN}/tx/${hash}`;

export const DOCS_URL = 'https://docs.diversifi.tech/';
export const TERMS_URL = '/terms';
// The PDFs are served from diversifi.tech/docs/; keep them there (or in public/docs/) when this site takes over the domain.
export const WHITEPAPER_URL = 'https://diversifi.tech/docs/whitepaper.pdf';
export const AUDIT_URL = 'https://diversifi.tech/docs/diversifi-audit.pdf';
// TODO(open item 4): contact address and X handle are unconfirmed.
export const CONTACT_MAIL = 'mailto:hello@diversifi.tech';
export const X_URL = 'https://x.com/0xDiversiFi';

export const ALLOCATION_DATE = '30 Oct 2026';
export const FOOTNOTE = `Target allocation as of ${ALLOCATION_DATE}. Diversification reduces single-issuer exposure; it does not eliminate risk.`;

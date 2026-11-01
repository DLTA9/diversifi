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

export const ETHERSCAN = 'https://etherscan.io';
export const rmUrl = `${ETHERSCAN}/address/${RM_ADDR}`;
export const tokenUrl = `${ETHERSCAN}/token/${TOKEN_ADDR}`;
export const coinUrl = (c: Coin) => `${ETHERSCAN}/token/${c.address}?a=${RM_ADDR}`;
export const txUrl = (hash: string) => `${ETHERSCAN}/tx/${hash}`;

export const DOCS_URL = 'https://docs.diversifi.tech/';
export const TERMS_URL = 'https://docs.diversifi.tech/terms/general-tos';
// TODO: whitepaper URL. The docs site has no whitepaper page yet.
export const WHITEPAPER_URL = '#';
// TODO(open item 4): contact address and X handle are unconfirmed.
export const CONTACT_MAIL = 'mailto:hello@diversifi.tech';
export const X_URL = 'https://x.com/';

export const ALLOCATION_DATE = '30 Oct 2026';
export const FOOTNOTE = `Target allocation as of ${ALLOCATION_DATE}. Diversification reduces single-issuer exposure; it does not eliminate risk. Mint and redeem fees apply.`;
export const VAULT_FOOTNOTE = 'DiversiFi Vault is not live. Yield is variable and not guaranteed. Smart-contract and underlying-asset risk apply.';
// TODO(open item 4): legal entity and jurisdiction placeholders.
export const ENTITY_FOOTNOTE = 'DiversiFi is operated by [legal entity name], [jurisdiction]. DFiUSD is not a bank deposit and is not insured.';

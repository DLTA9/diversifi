import { AUDIT_URL, COINS, rmUrl } from './coins';
import type { ReserveReading } from './reserve';

// One source for the /faq page, its FAQPage JSON-LD and llms.txt, so they never drift apart.
// Answers are segments: plain text, or a link. The JSON-LD uses the plain-text join.
export type Seg = string | { text: string; href: string };
export type Faq = { q: string; a: Seg[] };

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const pct = (f: number) => `${(f * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

/** "30% USDC, 15% each DAI and USDS, and 10% each for USDT, GHO, FDUSD and frxUSD", from the live targets. */
function split(r: ReserveReading) {
  const groups = new Map<number, string[]>();
  r.coins.forEach(c => groups.set(c.target, [...(groups.get(c.target) ?? []), c.t]));
  const parts = [...groups].sort((a, b) => b[0] - a[0]).map(([t, coins], i, all) => {
    const p = `${+t.toFixed(1)}%`;
    if (coins.length === 1) return `${p} ${coins[0]}`;
    return i === all.length - 1 && all.length > 1 ? `${p} each for ${list(coins)}` : `${p} each ${list(coins)}`;
  });
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

// Questions are phrased the way people search ("what is …", "is … audited", "how do I …"), so each one
// can match a query on its own. Keep answers to facts the site already states.
export function faqs(r: ReserveReading, live: boolean): Faq[] {
  const fee = live ? ` It is currently ${pct(r.mintFee)} to mint and ${pct(r.burnFee)} to redeem.` : '';
  return [
    {
      q: 'what is DFiUSD?',
      a: [`DFiUSD is a USD stablecoin on Ethereum, issued by DiversiFi. Each DFiUSD is backed 1:1 by a basket of seven USD stablecoins (${list(COINS.map(c => c.t))}) held in the ReserveManagerV1 smart contract, so no single issuer backs the whole token.`],
    },
    {
      q: 'what is a diversified stablecoin?',
      a: ['A stablecoin backed by several other stablecoins instead of one issuer’s reserves. If one issuer fails or depegs, only its share of the backing is affected. Today 61% of all stablecoin supply sits with a single issuer.'],
    },
    {
      q: 'what is DFiUSD backed by?',
      a: [`Seven USD stablecoins from six issuers, held on Ethereum at a target split of ${split(r)}. Every balance is readable on-chain.`],
    },
    {
      q: 'what happens if a stablecoin in the basket depegs?',
      a: ['The loss stays in that coin’s slice. Its target can be set to 0%, every swap then moves the reserve away from it, and minting can be paused while it is still held. Swap fees also fill an insurance fund that can buy a failing coin out of the reserve.'],
    },
    {
      q: 'how can I verify DFiUSD’s reserves?',
      a: ['Open ', { text: 'ReserveManagerV1 on Etherscan', href: rmUrl }, ' and read each coin’s balance, or use the ', { text: 'reserve table', href: '/#reserve' }, ' on the home page, where every figure links to the balance it was read from.'],
    },
    {
      q: 'is DFiUSD audited?',
      a: ['Yes. The DFiUSD token and the ReserveManagerV1 contract were audited by Nethermind (', { text: 'read the report', href: AUDIT_URL }, ') and CertiK, and their source code is verified on Etherscan.'],
    },
    {
      q: 'what are DFiUSD’s fees?',
      // TODO(open item 3): fee wording needs compliance sign-off.
      a: [`Minting and redeeming can carry a fee, set in the contract.${fee} The app reads the fee from the chain and shows exactly what you will receive before you confirm.`],
    },
    {
      q: 'how do I redeem DFiUSD?',
      a: ['Connect a wallet in the ', { text: 'DiversiFi app', href: '/app' }, ' and burn DFiUSD. You receive the reserve’s current mix of all seven coins, less any redeem fee, not a single coin.'],
    },
    {
      q: 'what are the risks of holding DFiUSD?',
      a: ['Diversification reduces single-issuer exposure; it does not eliminate risk. DFiUSD carries smart-contract risk and the risk of each coin in the basket. It is not a bank deposit and is not insured.'],
    },
  ];
}

export const faqText = (a: Seg[]) => a.map(s => (typeof s === 'string' ? s : s.text)).join('');

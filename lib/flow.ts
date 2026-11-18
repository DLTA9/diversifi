// Pure mint/redeem maths mirroring ReserveManagerV1 (see ReserveMath: SHIFT = 96, allocation is a uint88 fraction).
import { COINS } from './coins';

const SHIFT = 96n;
const ALLOC_SHIFT = 8n; // uint88 allocation << 8 = Q96 fixed point
const E18 = 10n ** 18n;

export type TargetParam = { assetAddress: `0x${string}`; targetAllocation: bigint; decimals: number };

const scale = (v: bigint, from: number, to: number) =>
  from === to ? v : from < to ? v * 10n ** BigInt(to - from) : v / 10n ** BigInt(from - to);

/**
 * Exact per-coin deposits `mint(mintAmount)` will pull, in each coin's native units, in fixed brand order.
 * The fee is added on top: trueMint = mintAmount + mintAmount * compoundingFeeQ96 >> 96.
 */
export function mintDeposits(mintAmount: bigint, targets: readonly TargetParam[], compoundingFeeQ96: bigint) {
  const trueMint = mintAmount + ((mintAmount * compoundingFeeQ96) >> SHIFT);
  const by = new Map(targets.map(p => [p.assetAddress.toLowerCase(), p]));
  return COINS.map(c => {
    const p = by.get(c.address.toLowerCase());
    if (!p) return { coin: c, decimals: 18, amount: 0n };
    const scaled = ((p.targetAllocation << ALLOC_SHIFT) * trueMint) >> SHIFT;
    return { coin: c, decimals: p.decimals, amount: scale(scaled, 18, p.decimals) + 1n };
  });
}

/** Parse a ≤2-decimal user string into 18-decimal units. */
export function parseAmount(v: string): bigint | null {
  if (!/^\d*\.?\d{0,2}$/.test(v) || v === '' || v === '.') return null;
  const [i, f = ''] = v.split('.');
  return BigInt(i || '0') * E18 + BigInt((f + '00').slice(0, 2)) * 10n ** 16n;
}

export const toNum = (v: bigint, decimals: number) => Number(v) / 10 ** decimals;

/** Largest mint (18 dec) the wallet's basket balances can cover, floored to cents. */
export function maxMint(balances: bigint[], targets: readonly TargetParam[], compoundingFeeQ96: bigint): bigint {
  const one = mintDeposits(E18 * 1000n, targets, compoundingFeeQ96); // deposits per 1000 DFiUSD
  let best: bigint | null = null;
  one.forEach((d, i) => {
    if (d.amount <= 1n) return;
    const cap = (balances[i] * E18 * 1000n) / d.amount;
    if (best === null || cap < best) best = cap;
  });
  const b = (best ?? 0n) as bigint;
  const cent = 10n ** 16n;
  const floored = (b / cent) * cent;
  return floored > cent ? floored - cent : 0n; // one cent headroom for the +1 rounding per coin
}

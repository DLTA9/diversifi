// Exact rebalancing maths, a line-by-line copy of ReserveManagerV1.swapTowardsTarget and ReserveMath
// (Sourcify exact match). All values are bigints in the contract's own units, so the app shows exactly what the
// contract will do and never offers an amount the contract would reject.
import { isAddressEqual, type Address } from 'viem';

const SHIFT = 96n;
const ALLOC_SHIFT = 8n; // 0.88 fixed point → 96.96
const SCALE = 1n << SHIFT;
const DEC = 18; // the reserve tracks every coin scaled to 18 decimals
const UINT88_MAX = (1n << 88n) - 1n;

export type RebAsset = { address: Address; targetAllocation: bigint; decimals: number; held: bigint };
/** One consistent reading of the reserve: current asset list, scaled holdings, total, reward pool, size limit. */
export type RebState = { assets: RebAsset[]; total: bigint; bounty: bigint; maxReserves: bigint };

export const scaleDecimals = (v: bigint, from: number, to: number) =>
  from === to ? v : from < to ? v * 10n ** BigInt(to - from) : v / 10n ** BigInt(from - to);
const abs = (n: bigint) => (n < 0n ? -n : n);

/** ReserveMath.calcMaxIndividualDelta: positive = room to deposit, negative = room to withdraw (18 decimals). */
export function maxDelta(a: RebAsset, total: bigint): bigint {
  if (a.targetAllocation === UINT88_MAX) return 0n;
  const norm = a.targetAllocation << ALLOC_SHIFT;
  const target = (norm * total) >> SHIFT;
  return ((target - a.held) << SHIFT) / (SCALE - norm); // BigInt division truncates toward zero, like Solidity
}

/** getEqualizationVectorScaled for one coin: target − held (18 decimals). Positive = short, negative = over. */
export const gapOf = (a: RebAsset, total: bigint) => ((a.targetAllocation << ALLOC_SHIFT) * total >> SHIFT) - a.held;

/** getTotalReservesDiscrepencyScaled: sum of |target − held| over the current asset list. */
export function discrepancy(assets: RebAsset[], total: bigint): bigint {
  return assets.reduce((sum, a) => sum + abs(gapOf(a, total)), 0n);
}

/** ReserveMath.calcEqualizationBounty. Returns null where the contract would revert (underflow). */
function bountyFor(pool: bigint, before: bigint, after: bigint): bigint | null {
  if (pool === 0n) return 0n;
  if (after > before) return null;
  return (pool * (before - after)) / before;
}

/** Most a wallet can deposit (dir 'mint') or withdraw (dir 'redeem') of one coin, in the coin's own units. */
export function room(state: RebState, asset: Address, dir: 'mint' | 'redeem'): bigint {
  const a = state.assets.find(x => isAddressEqual(x.address, asset));
  if (!a) return 0n;
  const m = maxDelta(a, state.total);
  if (dir === 'mint') return m > 0n ? scaleDecimals(m, DEC, a.decimals) : 0n;
  return m < 0n ? scaleDecimals(-m, DEC, a.decimals) : 0n;
}

export type RebQuote =
  | { ok: true; coinUnits: bigint; dfi: bigint; reward: bigint }
  | { ok: false; reason: 'unknown' | 'too-much' | 'size-limit' | 'revert' };

/**
 * What swapTowardsTarget(asset, ±units) returns. Mint: you pay `coinUnits`, receive `dfi` (= deposit + reward).
 * Redeem: you receive `coinUnits`, burn `dfi` (= withdrawal − reward).
 */
export function quoteRebalance(state: RebState, asset: Address, dir: 'mint' | 'redeem', units: bigint): RebQuote {
  const i = state.assets.findIndex(x => isAddressEqual(x.address, asset));
  if (i < 0 || units <= 0n) return { ok: false, reason: 'unknown' };
  const a = state.assets[i];
  const before = discrepancy(state.assets, state.total);
  const m = maxDelta(a, state.total);
  const targetScaled = scaleDecimals(units, a.decimals, DEC);
  const trueUnits = scaleDecimals(targetScaled, DEC, a.decimals);
  const trueScaled = scaleDecimals(trueUnits, a.decimals, DEC);
  if (dir === 'mint') {
    if (targetScaled > m) return { ok: false, reason: 'too-much' };
    const total = state.total + trueScaled;
    // checkMaxTotalReservesLimit may raise the limit if it is off cooldown; we stay on the safe side and stop.
    if (total > state.maxReserves) return { ok: false, reason: 'size-limit' };
    const assets = state.assets.map((x, k) => (k === i ? { ...x, held: x.held + trueScaled } : x));
    const reward = bountyFor(state.bounty, before, discrepancy(assets, total));
    if (reward === null) return { ok: false, reason: 'revert' };
    return { ok: true, coinUnits: trueUnits, dfi: trueScaled + reward, reward };
  }
  if (-targetScaled < m || trueScaled > a.held) return { ok: false, reason: 'too-much' };
  const total = state.total - trueScaled;
  const assets = state.assets.map((x, k) => (k === i ? { ...x, held: x.held - trueScaled } : x));
  let reward = bountyFor(state.bounty, before, discrepancy(assets, total));
  if (reward === null) return { ok: false, reason: 'revert' };
  if (reward >= trueScaled) reward = trueScaled;
  return { ok: true, coinUnits: trueUnits, dfi: trueScaled - reward, reward };
}

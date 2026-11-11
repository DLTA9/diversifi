import { createPublicClient, fallback, http, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { reserveManagerAbi } from './abi';
import { COINS, RM_ADDR, type Ticker } from './coins';

export type ReserveMode = 'loading' | 'live' | 'stale' | 'unavailable';

/** One reading of the reserve, in fixed coin order. JSON-safe so it can cross the server/client boundary. */
export type ReserveReading = {
  coins: { t: Ticker; held: number; target: number; current: number }[];
  total: number;
  block: number;
  /** ms since epoch of the block the reading was taken at */
  readAt: number;
  mintFee: number; // fraction, e.g. 0.001
  burnFee: number;
  mintEnabled: boolean;
  maxReserves: number;
};

export const STALE_MS = 10 * 60_000;
export const POLL_MS = 60_000;

// RPC_URL is server-only (a private endpoint, never shipped to browsers); NEXT_PUBLIC_RPC_URL is the browser's.
// Short per-endpoint timeouts so a slow public node fails over instead of stalling a page render.
const RPCS = [
  typeof window === 'undefined' ? process.env.RPC_URL : undefined,
  process.env.NEXT_PUBLIC_RPC_URL,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
].filter((u): u is string => !!u);
export const rpcTransport = fallback(RPCS.map(u => http(u, { timeout: 4_000, retryCount: 1 })));

let client: PublicClient | null = null;
const getClient = () => (client ??= createPublicClient({ chain: mainnet, transport: rpcTransport, batch: { multicall: true } }) as PublicClient);

const Q96 = 2n ** 96n;
const E18 = 10n ** 18n;
const scaledToNum = (v: bigint) => Number(v / 10n ** 12n) / 1e6; // 18-dec scaled → dollars, 6dp precision

/**
 * Round shares to one decimal by largest remainder so they total exactly 100.0.
 * Input: raw weights. Output: percentages with one decimal.
 */
export function largestRemainder(weights: number[], total = 1000): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map(w => (w / sum) * total);
  const floor = raw.map(Math.floor);
  let left = total - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left-- <= 0) break; floor[i]++; }
  return floor.map(v => v / 10);
}

export async function readReserve(): Promise<ReserveReading> {
  const c = getClient();
  const rm = { address: RM_ADDR, abi: reserveManagerAbi } as const;
  const block = await c.getBlock();
  const at = { blockNumber: block.number };
  const [targets, total, mintFeeQ, burnFeeQ, mintEnabled, maxRes, ...held] = await Promise.all([
    c.readContract({ ...rm, functionName: 'getTargetAssetParams', ...at }),
    c.readContract({ ...rm, functionName: 'getTotalReservesScaled', ...at }),
    c.readContract({ ...rm, functionName: 'getMintFeeQ96', ...at }),
    c.readContract({ ...rm, functionName: 'getBurnFeeQ96', ...at }),
    c.readContract({ ...rm, functionName: 'getIsMintEnabled', ...at }),
    c.readContract({ ...rm, functionName: 'getMaxReserves', ...at }),
    ...COINS.map(coin => c.readContract({ ...rm, functionName: 'getSpecificReservesScaled', args: [coin.address], ...at })),
  ]);

  // Contract returns assets in its own order; map onto the fixed brand order by address.
  const tgtBy = new Map(targets.map(p => [p.assetAddress.toLowerCase(), p.targetAllocation]));
  const tgtRaw = COINS.map(coin => Number((tgtBy.get(coin.address.toLowerCase()) ?? 0n) / 10n ** 12n));
  const heldNum = (held as bigint[]).map(scaledToNum);
  const current = largestRemainder(heldNum);
  const target = largestRemainder(tgtRaw);

  return {
    coins: COINS.map((coin, i) => ({ t: coin.t, held: heldNum[i], target: target[i], current: current[i] })),
    total: scaledToNum(total as bigint),
    block: Number(block.number),
    readAt: Number(block.timestamp) * 1000,
    mintFee: Number(((mintFeeQ as bigint) * E18) / Q96) / 1e18,
    burnFee: Number(((burnFeeQ as bigint) * E18) / Q96) / 1e18,
    mintEnabled: mintEnabled as boolean,
    maxReserves: scaledToNum(maxRes as bigint),
  };
}

/** Last known reading (31 Oct 2026). Only used if the build-time read fails, and always shown as not live. */
export const FALLBACK_READING: ReserveReading = {
  coins: COINS.map(c => ({ t: c.t, held: (237975.66 * c.s) / 100, target: c.s, current: c.s })),
  total: 237975.66,
  block: 26315865,
  readAt: Date.UTC(2026, 9, 31, 9, 0),
  mintFee: 0,
  burnFee: 0,
  mintEnabled: true,
  maxReserves: 100_000_000,
};

export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};
export const fmtK = (v: number) => '$' + (v / 1000).toFixed(1) + 'K';
export const f2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtBlock = (n: number) => n.toLocaleString('en-US');
export const pct = (fraction: number) => (fraction * 100).toFixed(2) + '%';

import { getAddress, isAddressEqual, type Address } from 'viem';
import { COINS, RM_ADDR, TOKEN_ADDR } from './coins';

/**
 * Safety checks that must pass before the app lets anyone sign a transaction.
 * The trusted addresses below are fixed in code and checksummed at load, so a typo fails the build instead of
 * sending money somewhere else. Nothing here ever takes an address from the URL, an API or user input.
 */
export const CHAIN_ID = 1; // Ethereum mainnet. Sepolia uses the same contract addresses, so this check matters.
export const TRUSTED = {
  reserveManager: getAddress(RM_ADDR),
  token: getAddress(TOKEN_ADDR),
} as const;
const KNOWN_ASSETS = COINS.map(c => ({ address: getAddress(c.address), decimals: c.decimals }));
export type AssetParam = { assetAddress: Address; decimals: number };

export type GuardInput = {
  /** Reads from the chain; undefined while loading, null if the read failed. */
  indexToken?: Address | null;
  tokenReserveManager?: Address | null;
  emigrating?: boolean | null;
  migrating?: boolean | null;
  /** The basket's target coins and the coins the reserve holds now, as the contract reports them. */
  targetAssets?: readonly AssetParam[] | null;
  currentAssets?: readonly AssetParam[] | null;
  frozen?: boolean | null;
  /** From /api/status (the pause switch). */
  paused?: boolean;
  pauseMessage?: string;
};

export type Guard = { state: 'checking' | 'ok' | 'blocked'; reason: string };

export function evaluateGuard(g: GuardInput): Guard {
  if (g.paused) return { state: 'blocked', reason: g.pauseMessage || 'The app is paused for maintenance. Your funds are safe; try again later.' };
  const reads = [g.indexToken, g.tokenReserveManager, g.emigrating, g.migrating, g.targetAssets, g.currentAssets];
  if (reads.some(r => r === null)) return { state: 'blocked', reason: 'We couldn’t verify the DiversiFi contracts right now, so transactions are switched off. Try again in a minute.' };
  if (reads.some(r => r === undefined)) return { state: 'checking', reason: 'Verifying the DiversiFi contracts…' };
  if (!isAddressEqual(g.indexToken!, TRUSTED.token) || !isAddressEqual(g.tokenReserveManager!, TRUSTED.reserveManager))
    return { state: 'blocked', reason: 'The contracts don’t match the addresses this app trusts. Transactions are switched off. Please contact DiversiFi.' };
  if (g.emigrating || g.migrating)
    return { state: 'blocked', reason: 'DiversiFi is moving to a new reserve contract. Transactions are paused until the move is finished.' };
  // Every coin must be one we know, with the decimals we expect: a wrong decimals value would mean wrong amounts.
  const unknown = (a: AssetParam) => !KNOWN_ASSETS.some(k => isAddressEqual(k.address, a.assetAddress) && k.decimals === a.decimals);
  if (g.targetAssets!.some(unknown) || g.currentAssets!.some(unknown))
    return { state: 'blocked', reason: 'The basket contains a coin this app doesn’t know yet. Transactions are paused until the app is updated.' };
  if (g.frozen) return { state: 'blocked', reason: 'This wallet is frozen by the DFiUSD contract, so it can’t mint, redeem or swap.' };
  return { state: 'ok', reason: '' };
}

// Uniswap V4 pools that pair DFiUSD with each basket coin. Pool key checked on-chain 15 Nov 2026:
// fee 100 (0.01%), tick spacing 1, no hook.
import { encodeAbiParameters, getAddress, keccak256, zeroAddress, type Address } from 'viem';
import { TOKEN_ADDR } from './coins';

export const V4 = {
  quoter: getAddress('0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203'),
  stateView: getAddress('0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227'),
  poolManager: getAddress('0x000000000004444c5dc75cB358380D2e3dE08A90'),
} as const;
export const POOL_FEE = 100; // hundredths of a basis point → 0.01%
const DFI = getAddress(TOKEN_ADDR);

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

/** The pool for DFiUSD and `coin`. Currencies are sorted by address, as Uniswap requires. */
export function poolKey(coin: Address): PoolKey {
  const c = getAddress(coin);
  const [currency0, currency1] = BigInt(c) < BigInt(DFI) ? [c, DFI] : [DFI, c];
  return { currency0, currency1, fee: POOL_FEE, tickSpacing: 1, hooks: zeroAddress };
}

export const poolId = (k: PoolKey) =>
  keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
  ));

/** True when selling `from` into this pool moves currency0 → currency1. */
export const zeroForOne = (k: PoolKey, from: Address) => getAddress(from) === k.currency0;

/** Mid price of 1 DFiUSD in `coin` units (both as whole tokens), from the pool's sqrtPriceX96. */
export function dfiPrice(k: PoolKey, sqrtPriceX96: bigint, coinDecimals: number): number {
  const p = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // raw currency1 per raw currency0
  const dfiIs0 = k.currency0 === DFI;
  // whole-token price of currency0 in currency1
  const p01 = p * 10 ** ((dfiIs0 ? 18 : coinDecimals) - (dfiIs0 ? coinDecimals : 18));
  return dfiIs0 ? p01 : 1 / p01;
}

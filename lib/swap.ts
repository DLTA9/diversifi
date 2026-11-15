// Swaps through Uniswap's Universal Router (V4 pools) with Permit2, the same contracts app.uniswap.org uses.
// Safety rules, all enforced here or in AppFlow before anything is signed:
//  - exact approvals only: the coin is approved to Permit2 for exactly the amount in, never "unlimited";
//  - the Permit2 signature covers exactly that amount, for this router only, and expires after 30 minutes;
//  - a minimum output (quote minus SLIPPAGE_BPS) is written into the transaction: the router reverts rather than pay less;
//  - a 20-minute deadline, after which the router refuses to execute;
//  - the router pays the output to the wallet that sent the transaction (TAKE_ALL), never to another address.
import { concatHex, encodeAbiParameters, getAddress, toHex, type Address, type Hex } from 'viem';
import type { PoolKey } from './uniswap';

export const UNIVERSAL_ROUTER = getAddress('0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af');
export const PERMIT2 = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3');

/** Most the output may fall below the quote before the swap reverts: 0.30%. Stablecoin pools barely move. */
export const SLIPPAGE_BPS = 30n;
/** Swaps that would lose more than this to price impact are refused; above WARN_IMPACT a warning shows. */
export const MAX_IMPACT = 0.03;
export const WARN_IMPACT = 0.005;
/** Refuse a swap that pays less than this per dollar in (a sign of a de-pegged or drained pool). */
export const MIN_RATE = 0.97;
export const DEADLINE_S = 20 * 60;
export const PERMIT_TTL_S = 30 * 60;

const CMD = { PERMIT2_PERMIT: 0x0a, V4_SWAP: 0x10 } as const;
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f } as const;

export const minOut = (quoted: bigint) => (quoted * (10_000n - SLIPPAGE_BPS)) / 10_000n;

export type PermitSingle = {
  details: { token: Address; amount: bigint; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: bigint;
};

/** EIP-712 data for a Permit2 PermitSingle: exactly `amount` of `token`, for the Universal Router only. */
export function permitTypedData(token: Address, amount: bigint, nonce: number, now: number) {
  const message: PermitSingle = {
    details: { token: getAddress(token), amount, expiration: now + PERMIT_TTL_S, nonce },
    spender: UNIVERSAL_ROUTER,
    sigDeadline: BigInt(now + PERMIT_TTL_S),
  };
  return {
    domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2 },
    types: {
      PermitDetails: [
        { name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' },
        { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' },
      ],
      PermitSingle: [
        { name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' },
      ],
    },
    primaryType: 'PermitSingle' as const,
    message,
  };
}

const poolKeyType = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' },
  ],
} as const;

/** Arguments for UniversalRouter.execute(commands, inputs, deadline): optional permit, then one exact-in V4 swap. */
export function buildSwap(p: {
  key: PoolKey; tokenIn: Address; tokenOut: Address; amountIn: bigint; minAmountOut: bigint; now: number;
  permit?: { message: PermitSingle; signature: Hex };
}): readonly [Hex, Hex[], bigint] {
  const zeroForOne = getAddress(p.tokenIn) === p.key.currency0;
  if (getAddress(zeroForOne ? p.key.currency1 : p.key.currency0) !== getAddress(p.tokenOut)) throw new Error('token pair does not match pool');
  if (p.amountIn <= 0n || p.minAmountOut <= 0n) throw new Error('amounts must be above zero');

  const swap = encodeAbiParameters(
    [{ type: 'tuple', components: [
      { name: 'poolKey', ...poolKeyType }, { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' }, { name: 'hookData', type: 'bytes' },
    ] }],
    [{ poolKey: p.key, zeroForOne, amountIn: p.amountIn, amountOutMinimum: p.minAmountOut, hookData: '0x' }],
  );
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [p.tokenIn, p.amountIn]);
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [p.tokenOut, p.minAmountOut]);
  const v4Input = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [concatHex([toHex(ACT.SWAP_EXACT_IN_SINGLE, { size: 1 }), toHex(ACT.SETTLE_ALL, { size: 1 }), toHex(ACT.TAKE_ALL, { size: 1 })]), [swap, settle, take]],
  );

  const commands: Hex[] = [];
  const inputs: Hex[] = [];
  if (p.permit) {
    commands.push(toHex(CMD.PERMIT2_PERMIT, { size: 1 }));
    inputs.push(encodeAbiParameters(
      [{ type: 'tuple', components: [
        { name: 'details', type: 'tuple', components: [
          { name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' },
        ] },
        { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' },
      ] }, { type: 'bytes' }],
      [p.permit.message, p.permit.signature],
    ));
  }
  commands.push(toHex(CMD.V4_SWAP, { size: 1 }));
  inputs.push(v4Input);
  return [concatHex(commands), inputs, BigInt(p.now + DEADLINE_S)] as const;
}

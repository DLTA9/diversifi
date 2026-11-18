// The wallet steps that move money: exact approvals, the Permit2 permission, a simulation, then the transaction.
// Shared by the app (components/AppFlow.tsx) and the fork tests (tests/*.fork.test.ts), so the tests run this exact code.
// The checks against what the person reviewed (fresh quotes, limits) stay in AppFlow, before these are called.
import type { Abi, Address, Hash, Hex, PublicClient } from 'viem';
import { erc20Abi, permit2Abi, reserveManagerAbi, routerAbi } from './abi';
import { COINS, RM_ADDR } from './coins';
import { buildSwap, DEADLINE_S, PERMIT2, PERMIT_TTL_S, permitTypedData, UNIVERSAL_ROUTER } from './swap';
import type { PoolKey } from './uniswap';

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
export type Wallet = {
  client: PublicClient;
  account: Address;
  write: (call: Call) => Promise<Hash>;
  sign: (typedData: ReturnType<typeof permitTypedData>) => Promise<Hex>;
  /** Called right before each wallet request, so the app can say what to confirm. */
  step?: (what: 'approve' | 'sign' | 'allow' | 'send', token?: Address) => void;
};

const USDT = COINS.find(c => c.t === 'USDT')!.address.toLowerCase();
const RM = { address: RM_ADDR, abi: reserveManagerAbi as Abi };

// No time limit: a slow block must never look like a failure, or people send again and pay twice.
async function mined(w: Wallet, hash: Hash) {
  const r = await w.client.waitForTransactionReceipt({ hash, timeout: 0 });
  if (r.status !== 'success') throw new Error('approval reverted');
}

async function simulateAndSend(w: Wallet, call: Call) {
  await w.client.simulateContract({ ...call, account: w.account } as never);
  w.step?.('send');
  return w.write(call);
}

/** Approve exactly `units` of `token` to `spender`, only if the current allowance is too small. USDT must go to 0 first. */
export async function approveExact(w: Wallet, token: Address, spender: Address, units: bigint) {
  const current = await w.client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [w.account, spender] });
  if (current >= units) return;
  w.step?.('approve', token);
  if (token.toLowerCase() === USDT && current > 0n) await mined(w, await w.write({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, 0n] }));
  await mined(w, await w.write({ address: token, abi: erc20Abi, functionName: 'approve', args: [spender, units] }));
}

/** Swap through the Universal Router: exact approval to Permit2, then a 30-minute permit for exactly this amount
 *  (signed, or approved on-chain for smart-account wallets, whose signatures are checked differently). */
export async function sendSwap(w: Wallet, p: { key: PoolKey; tokenIn: Address; tokenOut: Address; amountIn: bigint; minAmountOut: bigint; now: number }) {
  await approveExact(w, p.tokenIn, PERMIT2, p.amountIn);
  const [amount, expiration, nonce] = await w.client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [w.account, p.tokenIn, UNIVERSAL_ROUTER] });
  let permit: Parameters<typeof buildSwap>[0]['permit'];
  if (amount < p.amountIn || expiration <= p.now + DEADLINE_S) {
    if (((await w.client.getCode({ address: w.account })) ?? '0x').length > 2) {
      w.step?.('allow', p.tokenIn);
      await mined(w, await w.write({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [p.tokenIn, UNIVERSAL_ROUTER, p.amountIn, p.now + PERMIT_TTL_S] }));
    } else {
      w.step?.('sign', p.tokenIn);
      const td = permitTypedData(p.tokenIn, p.amountIn, Number(nonce), p.now);
      permit = { message: td.message, signature: await w.sign(td) };
    }
  }
  return simulateAndSend(w, { address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args: buildSwap({ ...p, permit }) });
}

/** One-coin rebalance: positive `delta` deposits the coin (approved exactly first), negative withdraws it. */
export async function sendRebalance(w: Wallet, asset: Address, delta: bigint) {
  if (delta > 0n) await approveExact(w, asset, RM_ADDR, delta);
  return simulateAndSend(w, { ...RM, functionName: 'swapTowardsTarget', args: [asset, delta] });
}

/** Full-basket mint: exact approval of every coin the quote asks for, then mint. */
export async function sendMint(w: Wallet, amount: bigint, deposits: { token: Address; amount: bigint }[]) {
  for (const d of deposits) if (d.amount > 0n) await approveExact(w, d.token, RM_ADDR, d.amount);
  return simulateAndSend(w, { ...RM, functionName: 'mint', args: [amount, '0x'] });
}

/** Full-basket redeem. The reserve burns the DFiUSD itself, so no approval is needed. */
export const sendBurn = (w: Wallet, amount: bigint) => simulateAndSend(w, { ...RM, functionName: 'burn', args: [amount, false, '0x'] });

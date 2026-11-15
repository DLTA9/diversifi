// Fork test: real swaps on a private copy of mainnet (anvil at :8545), using the app's own lib/swap.ts code.
import { parseAbi, createPublicClient, createTestClient, createWalletClient, http, parseUnits, getAddress, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { erc20Abi, permit2Abi, routerAbi, v4QuoterAbi } from '../lib/abi';
import { COINS, RM_ADDR, TOKEN_ADDR } from '../lib/coins';
import { poolKey, V4 } from '../lib/uniswap';
import { buildSwap, minOut, permitTypedData, PERMIT2, PERMIT_TTL_S, UNIVERSAL_ROUTER } from '../lib/swap';

const chain = { ...mainnet, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } };
const transport = http('http://127.0.0.1:8545', { timeout: 60_000 });
const pub = createPublicClient({ chain, transport });
const test = createTestClient({ chain, transport, mode: 'anvil' });
// A fresh random account for every run (Anvil's built-in accounts have code attached on mainnet, so they act like contracts).
const me = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ chain, transport, account: me });
const DFI = getAddress(TOKEN_ADDR);

let fail = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) fail++; };
const bal = (t: Address) => pub.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [me.address] });
const now = async () => Number((await pub.getBlock()).timestamp);

async function fund(token: Address, amount: bigint) {
  await test.impersonateAccount({ address: RM_ADDR });
  await test.setBalance({ address: RM_ADDR, value: 10n ** 18n });
  const h = await createWalletClient({ chain, transport, account: RM_ADDR }).writeContract({ address: token, abi: parseAbi(['function transfer(address to, uint256 value)']), functionName: 'transfer', args: [me.address, amount] });
  await pub.waitForTransactionReceipt({ hash: h });
  await test.stopImpersonatingAccount({ address: RM_ADDR });
}

async function quote(tokenIn: Address, coin: Address, amountIn: bigint) {
  const key = poolKey(coin);
  const [out] = await pub.readContract({ address: V4.quoter, abi: v4QuoterAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: key, zeroForOne: getAddress(tokenIn) === key.currency0, exactAmount: amountIn, hookData: '0x' }] });
  return out;
}

/** The app's swap flow: exact approve to Permit2, sign an exact permit, then execute. Returns what was received. */
async function swap(tokenIn: Address, tokenOut: Address, coin: Address, amountIn: bigint, opts: { bumpMin?: bigint; deadlineOffset?: number } = {}) {
  const key = poolKey(coin);
  const q = await quote(tokenIn, coin, amountIn);
  const allowance = await pub.readContract({ address: tokenIn, abi: erc20Abi, functionName: 'allowance', args: [me.address, PERMIT2] });
  if (allowance < amountIn) await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, amountIn] }) });
  const [, , nonce] = await pub.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [me.address, tokenIn, UNIVERSAL_ROUTER] });
  const t = await now();
  const td = permitTypedData(tokenIn, amountIn, Number(nonce), t);
  const signature = await wallet.signTypedData(td);
  const args = buildSwap({ key, tokenIn, tokenOut, amountIn, minAmountOut: minOut(q) + (opts.bumpMin ?? 0n), now: t + (opts.deadlineOffset ?? 0), permit: { message: td.message, signature } });
  const before = [await bal(tokenIn), await bal(tokenOut)];
  await pub.simulateContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args, account: me });
  const hash = await wallet.writeContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args });
  const r = await pub.waitForTransactionReceipt({ hash });
  const after = [await bal(tokenIn), await bal(tokenOut)];
  return { q, status: r.status, spent: before[0] - after[0], got: after[1] - before[1], args, gas: r.gasUsed };
}

async function reverts(fn: () => Promise<unknown>) { try { await fn(); return false; } catch { return true; } }

(async () => {
  console.log('fork block', await pub.getBlockNumber());
  await test.setBalance({ address: me.address, value: 10n ** 18n });
  for (const c of COINS) {
    const coin = getAddress(c.address);
    await fund(coin, parseUnits('1000', c.decimals));
    const amt = parseUnits('100', c.decimals);
    const buy = await swap(coin, DFI, coin, amt);
    check(`${c.t} → DFiUSD: success, spent exactly 100`, buy.status === 'success' && buy.spent === amt, `got ${Number(buy.got) / 1e18} DFiUSD, gas ${buy.gas}`);
    check(`${c.t} → DFiUSD: received the quoted amount`, buy.got === buy.q, `quote ${buy.q}`);
    const left = await pub.readContract({ address: coin, abi: erc20Abi, functionName: 'allowance', args: [me.address, PERMIT2] });
    const [p2left] = await pub.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [me.address, coin, UNIVERSAL_ROUTER] });
    check(`${c.t}: no approval left over afterwards`, left === 0n && p2left === 0n, `erc20 ${left}, permit2 ${p2left}`);
    const sell = await swap(DFI, coin, coin, buy.got);
    check(`DFiUSD → ${c.t}: success, received the quote`, sell.status === 'success' && sell.spent === buy.got && sell.got === sell.q, `got ${Number(sell.got) / 10 ** c.decimals} ${c.t}`);
  }
  // Protection checks with USDC.
  const usdc = getAddress(COINS[0].address);
  const amt = parseUnits('50', 6);
  check('min-received protection: asking 1 unit above the quote reverts', await reverts(() => swap(usdc, DFI, usdc, amt, { bumpMin: 10n ** 18n })));
  check('deadline protection: an expired deadline reverts', await reverts(() => swap(usdc, DFI, usdc, amt, { deadlineOffset: -3600 })));
  const ok = await swap(usdc, DFI, usdc, amt);
  check('a normal swap still works after the failed ones', ok.status === 'success');
  check('replaying the same signed swap reverts (permit used, nothing approved)', await reverts(() => pub.simulateContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args: ok.args, account: me })));
  const fd = getAddress(COINS.find(c => c.t === 'FDUSD')!.address);
  check('FDUSD: a 20,000 quote is refused by the pool', await reverts(() => quote(fd, fd, parseUnits('20000', 18))));
  // Smart-account path: a wallet with code attached (here Anvil's account #0, which has EIP-7702 code on mainnet)
  // approves on-chain through Permit2.approve instead of signing.
  const smart = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  check('test wallet really has code attached', ((await pub.getCode({ address: smart })) ?? '0x').length > 2);
  await test.impersonateAccount({ address: smart });
  await test.setBalance({ address: smart, value: 10n ** 18n });
  const sw = createWalletClient({ chain, transport, account: smart });
  await test.impersonateAccount({ address: RM_ADDR });
  await pub.waitForTransactionReceipt({ hash: await createWalletClient({ chain, transport, account: RM_ADDR }).writeContract({ address: usdc, abi: parseAbi(['function transfer(address to, uint256 value)']), functionName: 'transfer', args: [smart, amt] }) });
  const t = await now();
  const q = await quote(usdc, usdc, amt);
  await pub.waitForTransactionReceipt({ hash: await sw.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, amt] }) });
  await pub.waitForTransactionReceipt({ hash: await sw.writeContract({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [usdc, UNIVERSAL_ROUTER, amt, t + PERMIT_TTL_S] }) });
  const sargs = buildSwap({ key: poolKey(usdc), tokenIn: usdc, tokenOut: DFI, amountIn: amt, minAmountOut: minOut(q), now: t });
  const b0 = await pub.readContract({ address: DFI, abi: erc20Abi, functionName: 'balanceOf', args: [smart] });
  const sr = await pub.waitForTransactionReceipt({ hash: await sw.writeContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args: sargs }) });
  const b1 = await pub.readContract({ address: DFI, abi: erc20Abi, functionName: 'balanceOf', args: [smart] });
  check('smart-account wallet: on-chain approval route swaps for the quote', sr.status === 'success' && b1 - b0 === q, `got ${Number(b1 - b0) / 1e18}`);
  const [p2] = await pub.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [smart, usdc, UNIVERSAL_ROUTER] });
  check('smart-account wallet: no approval left over', p2 === 0n);
  process.exit(fail);
})().catch(e => { console.error('CRASH', e.shortMessage ?? e.message, e.walk?.((x: any) => x.raw)?.raw ?? ''); process.exit(1); });

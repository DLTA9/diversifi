// Fork test: real swaps on a private copy of mainnet (anvil at :8545), through the app's own lib/flows.ts code.
import { parseAbi, createPublicClient, createTestClient, createWalletClient, decodeFunctionData, http, parseUnits, getAddress, type Address, type PublicClient, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { erc20Abi, permit2Abi, routerAbi, v4QuoterAbi } from '../lib/abi';
import { COINS, RM_ADDR, TOKEN_ADDR } from '../lib/coins';
import { poolKey, V4 } from '../lib/uniswap';
import { minOut, PERMIT2, UNIVERSAL_ROUTER } from '../lib/swap';
import { sendSwap, type Wallet } from '../lib/flows';

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

/** The app's own swap flow (lib/flows.ts sendSwap) driven by a test wallet. Returns what was spent and received. */
const asWallet = (wc: WalletClient, account: Address): Wallet => ({
  client: pub as unknown as PublicClient, account,
  write: call => wc.writeContract({ ...call, chain } as never), // the wallet client's own account signs
  sign: td => wc.signTypedData(td as never),
});
async function swap(tokenIn: Address, tokenOut: Address, coin: Address, amountIn: bigint, opts: { bumpMin?: bigint; deadlineOffset?: number; who?: Wallet } = {}) {
  const w = opts.who ?? asWallet(wallet, me.address);
  const q = await quote(tokenIn, coin, amountIn);
  const balOf = (t: Address) => pub.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [w.account] });
  const before = [await balOf(tokenIn), await balOf(tokenOut)];
  const hash = await sendSwap(w, { key: poolKey(coin), tokenIn, tokenOut, amountIn, minAmountOut: minOut(q) + (opts.bumpMin ?? 0n), now: (await now()) + (opts.deadlineOffset ?? 0) });
  const r = await pub.waitForTransactionReceipt({ hash });
  const after = [await balOf(tokenIn), await balOf(tokenOut)];
  return { q, status: r.status, spent: before[0] - after[0], got: after[1] - before[1], hash, gas: r.gasUsed };
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
  const { args: replay } = decodeFunctionData({ abi: routerAbi, data: (await pub.getTransaction({ hash: ok.hash })).input });
  check('replaying the same signed swap reverts (permit used, nothing approved)', await reverts(() => pub.simulateContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args: replay as never, account: me })));
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
  const sb = await swap(usdc, DFI, usdc, amt, { who: { ...asWallet(sw, smart), sign: () => { throw new Error('a smart-account wallet must not be asked to sign'); } } });
  check('smart-account wallet: on-chain approval route swaps for the quote', sb.status === 'success' && sb.got === sb.q, `got ${Number(sb.got) / 1e18}`);
  const [p2] = await pub.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [smart, usdc, UNIVERSAL_ROUTER] });
  check('smart-account wallet: no approval left over', p2 === 0n);
  process.exit(fail);
})().catch(e => { console.error('CRASH', e.shortMessage ?? e.message, e.walk?.((x: any) => x.raw)?.raw ?? ''); process.exit(1); });

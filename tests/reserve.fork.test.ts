// Fork test: full-basket mint and redeem, and one-coin rebalancing with a reward, on a private copy of mainnet
// (anvil at :8545), through the app's own lib/flows.ts code: exact quote → exact approvals → simulate → send.
// To make rebalancing possible, the test acts as the governance timelock on the copy (never on the real chain):
// it moves 5% of USDC's target to USDT and funds a 25 DFiUSD reward pool.
import { createPublicClient, createTestClient, createWalletClient, getAddress, http, parseAbi, parseUnits, type Address, type PublicClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { erc20Abi, helpersAbi, reserveManagerAbi } from '../lib/abi';
import { COINS, HELPERS_ADDR, RM_ADDR, TOKEN_ADDR } from '../lib/coins';
import { quoteRebalance, room, type RebState } from '../lib/rebalance';
import { sendBurn, sendMint, sendRebalance, type Wallet } from '../lib/flows';

const chain = { ...mainnet, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } };
const transport = http('http://127.0.0.1:8545', { timeout: 60_000 });
const pub = createPublicClient({ chain, transport });
const test = createTestClient({ chain, transport, mode: 'anvil' });
const me = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ chain, transport, account: me });
const TIMELOCK = getAddress('0x00890D5630f8e46aCFabDE50cD260acc5c605D33');
const DFI = getAddress(TOKEN_ADDR);
const RM = { address: RM_ADDR, abi: reserveManagerAbi } as const;
const adminAbi = parseAbi([
  'struct AssetParams { address assetAddress; uint88 targetAllocation; uint8 decimals; }',
  'function setTargetAssetParams(AssetParams[] _params)',
  'function increaseEqualizationBounty(uint256 _bountyIncrease)',
]);
const xfer = parseAbi(['function transfer(address to, uint256 value)', 'function burn(uint256 amount)']);

let fail = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) fail++; };
const bal = (t: Address, who: Address = me.address) => pub.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [who] });
const send = async (h: Promise<`0x${string}`>) => { const r = await pub.waitForTransactionReceipt({ hash: await h }); if (r.status !== 'success') throw new Error('reverted'); return r; };
const as = async (who: Address, fn: (w: ReturnType<typeof createWalletClient>) => Promise<`0x${string}`>) => {
  await test.impersonateAccount({ address: who });
  await test.setBalance({ address: who, value: 10n ** 18n });
  const r = await send(fn(createWalletClient({ chain, transport, account: who })));
  await test.stopImpersonatingAccount({ address: who });
  return r;
};
const reverts = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };
const setApproval = (token: Address, amount: bigint) => send(wallet.writeContract({ address: token, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, amount] }));
const w: Wallet = { client: pub as unknown as PublicClient, account: me.address, write: call => wallet.writeContract(call as never), sign: () => { throw new Error('not used for the reserve'); } };

async function rebState(): Promise<RebState> {
  const [cur, total, bounty, maxReserves] = await Promise.all([
    pub.readContract({ ...RM, functionName: 'getCurrentAssetParams' }),
    pub.readContract({ ...RM, functionName: 'getTotalReservesScaled' }),
    pub.readContract({ ...RM, functionName: 'getEqualizationBounty' }),
    pub.readContract({ ...RM, functionName: 'getMaxReserves' }),
  ]);
  const held = await Promise.all(cur.map(a => pub.readContract({ ...RM, functionName: 'getSpecificReservesScaled', args: [a.assetAddress] })));
  return { total, bounty, maxReserves, assets: cur.map((a, i) => ({ address: a.assetAddress, targetAllocation: a.targetAllocation, decimals: a.decimals, held: held[i] })) };
}

(async () => {
  console.log('fork block', await pub.getBlockNumber());
  await test.setBalance({ address: me.address, value: 10n ** 18n });
  for (const c of COINS) await as(RM_ADDR, w => w.writeContract({ chain, account: RM_ADDR, address: c.address, abi: xfer, functionName: 'transfer', args: [me.address, parseUnits('1000', c.decimals)] }));

  /* ---------- full basket: mint 100 DFiUSD ---------- */
  const mintAmt = parseUnits('100', 18);
  const [inputs] = await pub.readContract({ address: HELPERS_ADDR, abi: helpersAbi, functionName: 'quoteMint', args: [mintAmt] });
  const before = await Promise.all(COINS.map(c => bal(c.address)));
  const dfi0 = await bal(DFI);
  await send(sendMint(w, mintAmt, inputs.map(x => ({ token: x.assetAddress, amount: x.amount }))));
  check('basket mint: received exactly 100 DFiUSD', (await bal(DFI)) - dfi0 === mintAmt);
  const spentOk = await Promise.all(COINS.map(async (c, i) => before[i] - (await bal(c.address)) === (inputs.find(x => x.assetAddress.toLowerCase() === c.address.toLowerCase())?.amount ?? 0n)));
  check('basket mint: each coin spent exactly the quoted amount', spentOk.every(Boolean));
  const left = await Promise.all(COINS.map(c => pub.readContract({ address: c.address, abi: erc20Abi, functionName: 'allowance', args: [me.address, RM_ADDR] })));
  check('basket mint: no approval left over on any coin', left.every(a => a === 0n));

  /* ---------- full basket: redeem 50 DFiUSD ---------- */
  const burnAmt = parseUnits('50', 18);
  const [outputs] = await pub.readContract({ address: HELPERS_ADDR, abi: helpersAbi, functionName: 'quoteBurn', args: [burnAmt] });
  const b2 = await Promise.all(COINS.map(c => bal(c.address)));
  await send(sendBurn(w, burnAmt));
  check('basket redeem: DFiUSD went down by exactly 50', dfi0 + mintAmt - (await bal(DFI)) === burnAmt);
  const gotOk = await Promise.all(COINS.map(async (c, i) => (await bal(c.address)) - b2[i] === (outputs.find(x => x.assetAddress.toLowerCase() === c.address.toLowerCase())?.amount ?? 0n)));
  check('basket redeem: each coin received exactly the quoted amount', gotOk.every(Boolean));
  check('basket redeem: can’t redeem more than the balance', await reverts(() => sendBurn(w, parseUnits('1000', 18))));

  /* ---------- make rebalancing possible on the copy: move 5% of USDC's target to USDT, fund a 25 DFiUSD reward ---------- */
  const targets = await pub.readContract({ ...RM, functionName: 'getTargetAssetParams' });
  const usdc = getAddress(COINS.find(c => c.t === 'USDC')!.address);
  const usdt = getAddress(COINS.find(c => c.t === 'USDT')!.address);
  const five = ((1n << 88n) - 1n) / 20n;
  const moved = targets.map(t => ({ ...t, targetAllocation: getAddress(t.assetAddress) === usdc ? t.targetAllocation - five : getAddress(t.assetAddress) === usdt ? t.targetAllocation + five : t.targetAllocation }));
  await as(TIMELOCK, w => w.writeContract({ chain, account: TIMELOCK, ...RM, abi: adminAbi, functionName: 'setTargetAssetParams', args: [moved] }));
  const pool0 = await pub.readContract({ ...RM, functionName: 'getEqualizationBounty' });
  await send(wallet.writeContract({ address: DFI, abi: xfer, functionName: 'burn', args: [parseUnits('30', 18)] })); // creates a surplus
  await as(TIMELOCK, w => w.writeContract({ chain, account: TIMELOCK, ...RM, abi: adminAbi, functionName: 'increaseEqualizationBounty', args: [parseUnits('25', 18)] }));
  let st = await rebState();
  check('setup: reward pool grew by 25 DFiUSD and USDT is short', st.bounty - pool0 === parseUnits('25', 18) && room(st, usdt, 'mint') > 0n, `USDT room ${Number(room(st, usdt, 'mint')) / 1e6}`);

  /* ---------- rebalance mint: add USDT (short) ---------- */
  const units = parseUnits('200', 6);
  const q = quoteRebalance(st, usdt, 'mint', units);
  check('rebalance quote is ok and pays a reward', q.ok && q.reward > 0n, q.ok ? `reward ${Number(q.reward) / 1e18}` : q.reason);
  if (q.ok) {
    const [u0, d0] = [await bal(usdt), await bal(DFI)];
    await send(sendRebalance(w, usdt, q.coinUnits));
    check('rebalance mint: spent exactly 200 USDT', u0 - (await bal(usdt)) === units);
    check('rebalance mint: received exactly 200 DFiUSD + the predicted reward', (await bal(DFI)) - d0 === q.dfi, `${Number(q.dfi) / 1e18} DFiUSD`);
    check('rebalance mint: no USDT approval left over', (await pub.readContract({ address: usdt, abi: erc20Abi, functionName: 'allowance', args: [me.address, RM_ADDR] })) === 0n);
  }
  st = await rebState();
  const over = room(st, usdt, 'mint') + 1n;
  check('rebalance mint: one unit over the limit is refused by the contract', await reverts(() => sendRebalance(w, usdt, over)));
  await setApproval(usdt, 0n);

  /* ---------- rebalance redeem: take out USDC (over target) ---------- */
  st = await rebState();
  const out = parseUnits('40', 6);
  const qr = quoteRebalance(st, usdc, 'redeem', out);
  check('rebalance redeem quote is ok', qr.ok, qr.ok ? `burns ${Number(qr.dfi) / 1e18} DFiUSD, reward ${Number(qr.reward) / 1e18}` : qr.reason);
  if (qr.ok) {
    const [u0, d0] = [await bal(usdc), await bal(DFI)];
    await send(sendRebalance(w, usdc, -out));
    check('rebalance redeem: received exactly 40 USDC', (await bal(usdc)) - u0 === out);
    check('rebalance redeem: burned exactly the predicted DFiUSD (40 minus reward)', d0 - (await bal(DFI)) === qr.dfi);
  }
  check('rebalance redeem: taking out a coin that is short is refused', await reverts(() => sendRebalance(w, usdt, -1n)));
  process.exit(fail);
})().catch(e => { console.error('CRASH', e.shortMessage ?? e.message); process.exit(1); });

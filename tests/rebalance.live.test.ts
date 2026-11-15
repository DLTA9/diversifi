import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { reserveManagerAbi } from '../lib/abi';
import { RM_ADDR } from '../lib/coins';
import { discrepancy, maxDelta, quoteRebalance, room, type RebState } from '../lib/rebalance';
const c = createPublicClient({ chain: mainnet, transport: http('https://ethereum-rpc.publicnode.com') });
const rm = { address: RM_ADDR, abi: reserveManagerAbi } as const;
(async () => {
let fail = 0; const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fail++; };
const blockNumber = await c.getBlockNumber();
const at = { blockNumber };
const cur = await c.readContract({ ...rm, functionName: 'getCurrentAssetParams', ...at });
const [total, bounty, maxRes, disc] = await Promise.all([
  c.readContract({ ...rm, functionName: 'getTotalReservesScaled', ...at }),
  c.readContract({ ...rm, functionName: 'getEqualizationBounty', ...at }),
  c.readContract({ ...rm, functionName: 'getMaxReserves', ...at }),
  c.readContract({ ...rm, functionName: 'getTotalReservesDiscrepencyScaled', ...at }),
]);
const held = await Promise.all(cur.map(a => c.readContract({ ...rm, functionName: 'getSpecificReservesScaled', args: [a.assetAddress], ...at })));
const st: RebState = { total, bounty, maxReserves: maxRes, assets: cur.map((a, i) => ({ address: a.assetAddress, targetAllocation: a.targetAllocation, decimals: a.decimals, held: held[i] })) };
check('discrepancy matches the contract', discrepancy(st.assets, st.total) === disc, `${disc}`);
// Ask the contract itself where the limit is. A call from an empty account passes the limit check and then fails on
// the token transfer; one unit past the limit fails on the limit check. The error text tells us which.
const why = async (asset: `0x${string}`, delta: bigint) => {
  try { await c.simulateContract({ ...rm, functionName: 'swapTowardsTarget', args: [asset, delta], account: '0x000000000000000000000000000000000000dEaD', blockNumber }); return 'ok'; }
  catch (e) { const m = String((e as Error).message); return m.includes('exceeds target allocation') ? 'LIMIT' : 'past-limit-check'; }
};
for (const a of st.assets) {
  const m = maxDelta(a, st.total);
  for (const dir of ['mint', 'redeem'] as const) {
    const r = room(st, a.address, dir);
    const sign = dir === 'mint' ? 1n : -1n;
    if (r > 0n) {
      check(`${a.address.slice(0, 8)} ${dir} at room ${r}: accepted`, (await why(a.address, sign * r)) !== 'LIMIT');
      check(`${a.address.slice(0, 8)} ${dir} at room+1: rejected`, (await why(a.address, sign * (r + 1n))) === 'LIMIT');
    } else {
      check(`${a.address.slice(0, 8)} ${dir} room 0 (maxDelta ${m}): 1 unit rejected`, (await why(a.address, sign)) === 'LIMIT');
    }
  }
}
// Synthetic off-target basket with a reward pool: maths sanity.
const syn: RebState = { total: 1000n * 10n ** 18n, bounty: 10n * 10n ** 18n, maxReserves: 10n ** 30n, assets: [
  { address: '0x0000000000000000000000000000000000000001', targetAllocation: (1n << 88n) / 2n, decimals: 6, held: 400n * 10n ** 18n },
  { address: '0x0000000000000000000000000000000000000002', targetAllocation: (1n << 88n) / 2n, decimals: 18, held: 600n * 10n ** 18n },
] };
const r1 = room(syn, '0x0000000000000000000000000000000000000001', 'mint');
check('synthetic: room to add coin 1 is 200', r1 >= 199_999_999n && r1 <= 200_000_000n, `${r1}`);
const q = quoteRebalance(syn, '0x0000000000000000000000000000000000000001', 'mint', r1);
check('synthetic: filling the whole gap earns ~the whole pool', q.ok && q.reward > 9n * 10n ** 18n && q.reward <= 10n * 10n ** 18n, q.ok ? `${q.reward}` : q.reason);
const qh = quoteRebalance(syn, '0x0000000000000000000000000000000000000001', 'mint', r1 / 2n);
check('synthetic: half the gap earns about half', qh.ok && qh.reward > 4n * 10n ** 18n && qh.reward < 6n * 10n ** 18n, qh.ok ? `${qh.reward}` : qh.reason);
const qo = quoteRebalance(syn, '0x0000000000000000000000000000000000000001', 'mint', r1 + 1n);
check('synthetic: one unit over is refused', !qo.ok && qo.reason === 'too-much');
const qw = quoteRebalance(syn, '0x0000000000000000000000000000000000000002', 'redeem', 100n * 10n ** 18n);
check('synthetic: redeem burns less than it pays out', qw.ok && qw.dfi < 100n * 10n ** 18n && qw.coinUnits === 100n * 10n ** 18n, qw.ok ? `${qw.dfi}` : qw.reason);
const qwrong = quoteRebalance(syn, '0x0000000000000000000000000000000000000001', 'redeem', 1n);
check('synthetic: cannot take out a coin that is short', !qwrong.ok);
process.exit(fail);
})();

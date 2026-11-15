import { evaluateGuard } from '../lib/guard';
const RM = '0x8978F3A0227453Dd0821bC8A85e4bEF96DAF8327', TOK = '0xDF100b8ABd3cd41fC5cC1236AD7c6629A901AfBf';
const assets = [{ assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 }, { assetAddress: '0xdC035D45d973E3EC169d2276DDab16f1e407384F', decimals: 18 }];
const good = { indexToken: TOK, tokenReserveManager: RM, emigrating: false, migrating: false, targetAssets: assets, currentAssets: assets, frozen: false, paused: false } as const;
const cases: [string, object, string][] = [
  ['all good', {}, 'ok'],
  ['still loading', { indexToken: undefined }, 'checking'],
  ['read failed', { emigrating: null }, 'blocked'],
  ['fake token address', { indexToken: '0x0000000000000000000000000000000000000001' }, 'blocked'],
  ['fake reserve address', { tokenReserveManager: '0x0000000000000000000000000000000000000002' }, 'blocked'],
  ['migrating', { emigrating: true }, 'blocked'],
  ['unknown coin added', { targetAssets: [...assets, { assetAddress: '0x0000000000000000000000000000000000000003', decimals: 18 }] }, 'blocked'],
  ['unknown coin still held', { currentAssets: [...assets, { assetAddress: '0x0000000000000000000000000000000000000003', decimals: 18 }] }, 'blocked'],
  ['known coin, wrong decimals', { targetAssets: [{ assetAddress: assets[0].assetAddress, decimals: 18 }] }, 'blocked'],
  ['current list read failed', { currentAssets: null }, 'blocked'],
  ['frozen wallet', { frozen: true }, 'blocked'],
  ['pause switch on', { paused: true }, 'blocked'],
  ['lowercase addresses still match', { indexToken: TOK.toLowerCase() }, 'ok'],
];
let fail = 0;
for (const [name, patch, want] of cases) {
  const got = evaluateGuard({ ...good, ...patch } as never).state;
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${name}: ${got}`);
  if (got !== want) fail++;
}
process.exit(fail);

// A wallet's DFiUSD history (mints, redemptions, Uniswap buys and sells, transfers), via Alchemy's Transfers API.
// Runs on the server so the Alchemy key (the RPC_URL secret) never reaches the browser. Results are cached for a
// minute per wallet at Cloudflare's edge, which also keeps repeated requests from using up the free Alchemy quota.
import { formatUnits, getAddress, isAddress } from 'viem';
import { DEPLOY_BLOCK, TOKEN_ADDR } from '@/lib/coins';
import { V4 } from '@/lib/uniswap';

export const dynamic = 'force-dynamic';

const ZERO = '0x0000000000000000000000000000000000000000';
type Transfer = { uniqueId: string; hash: string; from: string; to: string; blockNum: string; rawContract: { value: string | null }; metadata?: { blockTimestamp?: string } };
type Kind = 'MINT' | 'REDEEM' | 'BUY' | 'SELL' | 'IN' | 'OUT';

async function transfers(rpc: string, filter: { fromAddress?: string; toAddress?: string }): Promise<Transfer[]> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers',
      params: [{ fromBlock: '0x' + DEPLOY_BLOCK.toString(16), toBlock: 'latest', contractAddresses: [TOKEN_ADDR], category: ['erc20'], withMetadata: true, excludeZeroValue: true, order: 'desc', maxCount: '0x14', ...filter }],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const j = (await res.json()) as { result?: { transfers: Transfer[] }; error?: unknown };
  if (!j.result) throw new Error('upstream error');
  return j.result.transfers;
}

const same = (a: string | null | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase();

export async function GET(req: Request) {
  const input = new URL(req.url).searchParams.get('address') ?? '';
  if (!isAddress(input, { strict: false })) return Response.json({ error: 'invalid address' }, { status: 400 });
  const addr = getAddress(input);
  const rpc = process.env.RPC_URL;
  if (!rpc || !rpc.includes('alchemy.com')) return Response.json({ error: 'unavailable' }, { status: 503 });

  // Cloudflare's edge cache (absent in local `next dev`, where every request goes to Alchemy).
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(`https://activity.cache/${addr.toLowerCase()}`);
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=30' } });
  }

  try {
    const [outs, ins] = await Promise.all([transfers(rpc, { fromAddress: addr }), transfers(rpc, { toAddress: addr })]);
    const seen = new Set<string>();
    const rows = [...outs, ...ins]
      .filter(t => (seen.has(t.uniqueId) ? false : (seen.add(t.uniqueId), true)))
      .sort((a, b) => Number(BigInt(b.blockNum) - BigInt(a.blockNum)))
      .slice(0, 20)
      .map(t => {
        const kind: Kind = same(t.from, ZERO) ? 'MINT' : same(t.to, ZERO) ? 'REDEEM'
          : same(t.from, V4.poolManager) ? 'BUY' : same(t.to, V4.poolManager) ? 'SELL'
          : same(t.to, addr) ? 'IN' : 'OUT';
        return { kind, value: formatUnits(BigInt(t.rawContract.value ?? '0x0'), 18), hash: t.hash, ts: t.metadata?.blockTimestamp ?? null };
      });
    const body = JSON.stringify({ rows });
    if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' } })).catch(() => {});
    return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=30' } });
  } catch {
    // Never pass upstream error text through: it could contain the RPC URL and its key.
    return Response.json({ error: 'unavailable' }, { status: 502 });
  }
}

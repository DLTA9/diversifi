'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseEventLogs, zeroAddress, type Address, type ContractFunctionParameters, type Hash } from 'viem';
import { useConnect, useConnection, useConnectors, useDisconnect, usePublicClient, useReadContract, useReadContracts, useSignTypedData, useSwitchChain, useWriteContract } from 'wagmi';
import { erc20Abi, helpersAbi, indexTokenAbi, permit2Abi, reserveManagerAbi, routerAbi, stateViewAbi, v4QuoterAbi } from '@/lib/abi';
import { buildSwap, DEADLINE_S, MAX_IMPACT, MIN_RATE, minOut, PERMIT2, PERMIT_TTL_S, permitTypedData, SLIPPAGE_BPS, UNIVERSAL_ROUTER, WARN_IMPACT } from '@/lib/swap';
import { CHAIN_ID, evaluateGuard, TRUSTED, type GuardInput } from '@/lib/guard';
import { COINS, ETHERSCAN, FOOTNOTE, HELPERS_ADDR, RM_ADDR, TOKEN_ADDR, txUrl } from '@/lib/coins';
import { maxMint, parseAmount, toNum, type TargetParam } from '@/lib/flow';
import { quoteRebalance, room, type RebState } from '@/lib/rebalance';
import { dfiPrice, poolId, poolKey, V4, zeroForOne } from '@/lib/uniswap';
import { f2, hhmm, type ReserveReading } from '@/lib/reserve';
import { CHAIN_NAMES, PREVIEW_ADDR, WALLETS } from '@/lib/wagmi';
import { Mark, MiniBar, TokenIcon, Wordmark } from './brand';
import { ReserveBar } from './ReserveBar';
import { useReserve } from './ReserveProvider';
import s from '@/app/app/app.module.css';

type Step = 'amount' | 'review' | 'done';
type Toast = { color: string; text: string; word: string } | null;
type Activity = { kind: ActivityRow['kind']; amt: string; when: string; hash: string };
type ActivityRow = { kind: 'MINT' | 'REDEEM' | 'BUY' | 'SELL' | 'IN' | 'OUT'; value: string; hash: string; ts: string | null };

/** The value after it has stopped changing for `ms`, so quotes are fetched once per pause in typing, not per key. */
function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = window.setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
type Tab = 'swap' | 'contribute';
type Method = 'rebalance' | 'basket';

const short = (a?: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
// Balances are rounded down to the cent, so the shown balance is exactly what clicking it fills in.
const down2 = (n: number) => Math.floor(n * 100) / 100;
const E18 = 10n ** 18n;
const RM = { address: RM_ADDR, abi: reserveManagerAbi } as const;

// Coins with a DFiUSD pool on Uniswap V4 (all seven, checked with the V4 quoter on 15 Nov 2026).
const POOLED = new Set(['USDC', 'DAI', 'USDS', 'USDT', 'GHO', 'FDUSD', 'frxUSD']);
// Dev only: /app?drift=1 skews the reading so the rebalancing screens can be checked while the real reserve sits on target.
// Read after mount (see useDrift) so the server and first client render match.
const wantsDrift = () => process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).has('drift');
function drifted(r: ReserveReading): ReserveReading {
  const mult = [0.8, 1, 1, 1.35, 1, 1, 1];
  const held = r.coins.map((c, i) => c.held * mult[i]);
  const total = held.reduce((a, b) => a + b, 0);
  return { ...r, total, coins: r.coins.map((c, i) => ({ ...c, held: held[i], current: (held[i] / total) * 100 })) };
}

/** Per-coin gap to target in dollars. Positive: the reserve is short and accepts a deposit up to `room`.
 *  Negative: it holds too much and allows a withdrawal up to `room`. Mirrors ReserveMath.calcMaxIndividualDelta. */
function gaps(r: ReserveReading) {
  return r.coins.map(c => {
    const t = c.target / 100;
    const diff = t * r.total - c.held;
    return { diff, room: Math.abs(diff) / (1 - t) };
  });
}

function isRejection(e: unknown) {
  for (let c = e as { name?: string; code?: number; cause?: unknown } | undefined; c; c = c.cause as typeof c) {
    if (c.name === 'UserRejectedRequestError' || c.code === 4001) return true;
  }
  return false;
}

/* Coin picker: a styled pill over a native <select>, so it works with keyboards, screen readers and phone pickers. */
function CoinPick({ id, label, value, options, onChange }: {
  id: string; label: string; value: string;
  options: { value: string; label: string; color: string; note?: string; disabled?: boolean }[];
  onChange: (v: string) => void;
}) {
  const cur = options.find(o => o.value === value) ?? options[0];
  return (
    <span className={s.pick}>
      {cur.color ? <i className="sw" style={{ background: cur.color }} /> : <MiniBar width={22} height={8} gap={1} radius={1} />}
      <span>{cur.label}</span>
      <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
      <select id={id} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}{o.note ? ` · ${o.note}` : ''}</option>)}
      </select>
    </span>
  );
}

/* Fixed DFiUSD tag, same size as the picker. */
const DfiTag = () => <span className={s.unit}><TokenIcon size={18} />DFiUSD</span>;

export function AppFlow() {
  const { reading: live } = useReserve();
  const [drift, setDrift] = useState(false);
  useEffect(() => setDrift(wantsDrift()), []);
  const reading = useMemo(() => (drift ? drifted(live) : live), [live, drift]);
  // wagmi 3 names: useConnection (was useAccount), useConnectors, and mutate/mutateAsync on action hooks.
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending: connecting } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain } = useSwitchChain();
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const { mutateAsync: signTypedDataAsync } = useSignTypedData();
  const client = usePublicClient({ chainId: 1 });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>('amount');
  const [tab, setTab] = useState<Tab>('swap');
  // swap: 'buy' pays a coin for DFiUSD, 'sell' pays DFiUSD for a coin.
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  // mint & redeem: direction, then rebalance with one coin or use the full basket.
  const [dir, setDir] = useState<'mint' | 'redeem'>('mint');
  const [method, setMethod] = useState<Method>('rebalance');
  const [rebIdx, setRebIdx] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [focus, setFocus] = useState(false);
  const [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [failed, setFailed] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [done, setDone] = useState<{ at: number; hash: Hash; sumIn: string; sumOut: string; title: string; inLabel: string } | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [historyErr, setHistoryErr] = useState(false);
  const toastT = useRef(0);

  const connected = mounted && isConnected;
  const wrongNet = connected && chainId !== 1;
  const view = !connected ? 'connect' : wrongNet ? 'wrong-network' : step;

  const showToast = (t: Toast, ms?: number) => {
    clearTimeout(toastT.current);
    setToast(t);
    if (ms) toastT.current = window.setTimeout(() => setToast(null), ms);
  };

  /* ---------- chain reads ---------- */
  const user = (address ?? zeroAddress) as Address;
  const enabled = connected && !wrongNet;
  const params = useReadContracts({
    allowFailure: false,
    query: { enabled: mounted, refetchInterval: 60_000 },
    contracts: [
      { ...RM, functionName: 'getTargetAssetParams', chainId: 1 },
      { ...RM, functionName: 'getCompoundingMintFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getMintFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getBurnFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getIsMintEnabled', chainId: 1 },
      { ...RM, functionName: 'getEqualizationBounty', chainId: 1 },
      // Rebalancing state, read in the same call so every number is from the same block.
      { ...RM, functionName: 'getCurrentAssetParams', chainId: 1 },
      { ...RM, functionName: 'getTotalReservesScaled', chainId: 1 },
      { ...RM, functionName: 'getMaxReserves', chainId: 1 },
      ...COINS.map(c => ({ ...RM, functionName: 'getSpecificReservesScaled', args: [c.address], chainId: 1 })),
      // One multicall (well under viem's batch size), so all of these come from the same block. Typed loosely here and
      // read back by position below.
    ] as unknown as readonly ContractFunctionParameters[],
  });
  const wallet = useReadContracts({
    allowFailure: false,
    query: { enabled, refetchInterval: 60_000 },
    contracts: [
      { address: TOKEN_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [user], chainId: 1 },
      ...COINS.map(c => ({ address: c.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [user] as const, chainId: 1 as const })),
      ...COINS.map(c => ({ address: c.address, abi: erc20Abi, functionName: 'allowance' as const, args: [user, RM_ADDR] as const, chainId: 1 as const })),
    ],
  });
  const reads = { refetch: () => { params.refetch(); wallet.refetch(); } };

  /* ---------- safety checks (lib/guard.ts): genuine contracts, no migration, known coins, wallet not frozen, not paused ---------- */
  const guardReads = useReadContracts({
    allowFailure: true,
    query: { enabled: mounted, refetchInterval: 60_000 },
    contracts: [
      { address: TRUSTED.reserveManager, abi: reserveManagerAbi, functionName: 'getIndexToken', chainId: CHAIN_ID },
      { address: TRUSTED.reserveManager, abi: reserveManagerAbi, functionName: 'isEmigrating', chainId: CHAIN_ID },
      { address: TRUSTED.token, abi: indexTokenAbi, functionName: 'getReserveManager', chainId: CHAIN_ID },
      { address: TRUSTED.token, abi: indexTokenAbi, functionName: 'isMigrating', chainId: CHAIN_ID },
      { address: TRUSTED.token, abi: indexTokenAbi, functionName: 'isFrozen', args: [user], chainId: CHAIN_ID },
    ],
  });
  const [pause, setPause] = useState<{ paused: boolean; message: string } | null>(null);
  const loadPause = useCallback(async () => {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      const j = (await r.json()) as { paused: boolean; message: string };
      setPause(j);
      return j;
    } catch { const j = { paused: true, message: 'We couldn’t check the app status, so transactions are switched off for now.' }; setPause(j); return j; }
  }, []);
  useEffect(() => { loadPause(); const iv = window.setInterval(loadPause, 60_000); return () => clearInterval(iv); }, [loadPause]);
  const guardInput = (gr: typeof guardReads.data, p: typeof pause): GuardInput => {
    const v = <T,>(i: number): T | null | undefined => (!gr ? undefined : gr[i]?.status === 'success' ? (gr[i].result as T) : null);
    return {
      indexToken: v(0), emigrating: v(1), tokenReserveManager: v(2), migrating: v(3),
      frozen: address ? v<boolean>(4) ?? false : false,
      targetAssets: params.data ? (params.data[0] as readonly TargetParam[]) : params.isError ? null : undefined,
      currentAssets: params.data ? (params.data[6] as readonly TargetParam[]) : params.isError ? null : undefined,
      paused: p?.paused, pauseMessage: p?.message,
    };
  };
  const guard = evaluateGuard(guardInput(guardReads.data, pause));
  const safe = guard.state === 'ok';
  const pd = params.data as readonly unknown[] | undefined;
  const targets = (pd?.[0] ?? []) as readonly TargetParam[];
  const compFeeQ = (pd?.[1] ?? 0n) as bigint;
  const mintFeeQ = (pd?.[2] ?? 0n) as bigint;
  const burnFeeQ = (pd?.[3] ?? 0n) as bigint;
  const mintEnabledRead = pd?.[4] as boolean | undefined;
  const bountyRaw = (pd?.[5] ?? 0n) as bigint;
  const mintEnabled = mintEnabledRead ?? reading.mintEnabled;
  // Exact rebalancing state (lib/rebalance.ts). Dev-only ?drift=1 skews the holdings the same way as the display.
  const rebState = useMemo<RebState | null>(() => {
    if (!pd) return null;
    const current = pd[6] as readonly TargetParam[];
    const heldBy = new Map(COINS.map((c, i) => [c.address.toLowerCase(), pd[9 + i] as bigint]));
    const mult = [80n, 100n, 100n, 135n, 100n, 100n, 100n];
    let assets = current.map(a => ({ address: a.assetAddress, targetAllocation: a.targetAllocation, decimals: a.decimals, held: heldBy.get(a.assetAddress.toLowerCase()) ?? 0n }));
    let total = pd[7] as bigint;
    if (drift) {
      assets = assets.map(a => ({ ...a, held: (a.held * mult[Math.max(0, COINS.findIndex(c => c.address.toLowerCase() === a.address.toLowerCase()))]) / 100n }));
      total = assets.reduce((t, a) => t + a.held, 0n);
    }
    return { assets, total, bounty: drift ? 250n * E18 : bountyRaw, maxReserves: pd[8] as bigint };
  }, [pd, drift, bountyRaw]);
  const w = (wallet.data ?? []) as readonly bigint[];
  const dfiBal = w[0] ?? 0n;
  const coinBals = COINS.map((_, i) => w[1 + i] ?? 0n);
  const allowances = COINS.map((_, i) => w[8 + i] ?? 0n);
  const q96ToFrac = (q: bigint) => Number((q * E18) >> 96n) / 1e18;
  const mintFee = q96ToFrac(mintFeeQ);
  const burnFee = q96ToFrac(burnFeeQ);
  const bounty = drift ? 250 : toNum(bountyRaw ?? 0n, 18);
  const ready = !!params.data && !!wallet.data;
  const usdBal = (i: number) => toNum(coinBals[i], COINS[i].decimals);
  const dfiNum = toNum(dfiBal, 18);

  /* ---------- amount ---------- */
  const raw = parseAmount(amount);
  const amt = raw !== null ? toNum(raw, 18) : 0;
  // Quotes are fetched for the amount once typing pauses; until the quote matches what is typed, nothing can be submitted.
  const dRaw = useDebounced(raw);
  const settled = dRaw === raw;

  /* ---------- swap tab: live Uniswap V4 quote and pool price ---------- */
  const richest = COINS.reduce((best, _, i) => (usdBal(i) > usdBal(best) ? i : best), 0);
  const sIdx = swapIdx ?? richest;
  const sCoin = COINS[sIdx];
  const swapPayBal = side === 'buy' ? usdBal(sIdx) : dfiNum;
  const swapPooled = POOLED.has(sCoin.t);
  const sKey = useMemo(() => poolKey(sCoin.address), [sCoin.address]);
  const swapIn = dRaw && dRaw > 0n ? (side === 'buy' ? dRaw / 10n ** BigInt(18 - sCoin.decimals) : dRaw) : 0n;
  const swapQ = useReadContract({
    address: V4.quoter, abi: v4QuoterAbi, functionName: 'quoteExactInputSingle', chainId: 1,
    args: [{ poolKey: sKey, zeroForOne: zeroForOne(sKey, side === 'buy' ? sCoin.address : TOKEN_ADDR), exactAmount: swapIn, hookData: '0x' }],
    query: { enabled: mounted && tab === 'swap' && swapPooled && swapIn > 0n, refetchInterval: 15_000, retry: false },
  });
  const slot = useReadContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId(sKey)], chainId: 1, query: { enabled: mounted && swapPooled, refetchInterval: 30_000 } });
  // DFiUSD's market price, from the deepest pool (USDC).
  const usdcKey = useMemo(() => poolKey(COINS[0].address), []);
  const pegSlot = useReadContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId(usdcKey)], chainId: 1, query: { enabled: mounted, refetchInterval: 60_000 } });
  const peg = pegSlot.data && pegSlot.data[0] > 0n ? dfiPrice(usdcKey, pegSlot.data[0], COINS[0].decimals) : null;
  const mid = slot.data && slot.data[0] > 0n ? dfiPrice(sKey, slot.data[0], sCoin.decimals) : null; // coin per DFiUSD
  const swapOut = swapIn > 0n && swapQ.data && settled ? toNum(swapQ.data[0], side === 'buy' ? 18 : sCoin.decimals) : null;
  const atMid = mid ? (side === 'buy' ? amt / mid : amt * mid) : null;
  const impact = swapOut !== null && atMid ? Math.max(0, 1 - swapOut / atMid) : null;
  let swapErr = '';
  if (tab === 'swap' && swapIn > 0n && settled && swapQ.isError) swapErr = 'the pool can’t fill this amount. try a smaller one.';
  else if (tab === 'swap' && raw && ready && amt > swapPayBal) swapErr = 'amount is above your balance.';
  const tokenIn = side === 'buy' ? sCoin.address : TOKEN_ADDR;
  const tokenOut = side === 'buy' ? TOKEN_ADDR : sCoin.address;
  const inT = side === 'buy' ? sCoin.t : 'DFiUSD';
  const outT = side === 'buy' ? 'DFiUSD' : sCoin.t;
  // Per dollar in, what comes out (all seven coins and DFiUSD aim at $1). Below MIN_RATE the pool is treated as unsafe.
  const swapRate = swapOut !== null && amt > 0 ? swapOut / amt : null;
  if (!swapErr && tab === 'swap' && swapRate !== null && swapRate < MIN_RATE) swapErr = `this pool pays only ${swapRate.toFixed(3)} per ${inT} right now, so swaps through it are switched off.`;
  else if (!swapErr && tab === 'swap' && impact !== null && impact > MAX_IMPACT) swapErr = `price impact is too high (${(impact * 100).toFixed(2)}%). try a smaller amount.`;
  const swapMin = swapQ.data && settled ? minOut(swapQ.data[0]) : null;
  // What the wallet will be asked for: exact approval to Permit2 if missing, then a signature (or approval) for the router.
  const swapAllow = useReadContracts({
    allowFailure: false,
    query: { enabled: enabled && tab === 'swap', refetchInterval: 30_000 },
    contracts: [
      { address: tokenIn, abi: erc20Abi, functionName: 'allowance', args: [user, PERMIT2], chainId: 1 },
      { address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [user, tokenIn, UNIVERSAL_ROUTER], chainId: 1 },
    ],
  });
  const swapUnits = raw && raw > 0n ? (side === 'buy' ? raw / 10n ** BigInt(18 - sCoin.decimals) : raw) : 0n;
  const needErc20 = !swapAllow.data || swapAllow.data[0] < swapUnits;
  const needPermit = !swapAllow.data || swapAllow.data[1][0] < swapUnits || swapAllow.data[1][1] * 1000 < Date.now() + DEADLINE_S * 1000;
  const swapValid = tab === 'swap' && swapPooled && !!raw && raw > 0n && !swapErr && ready && swapOut !== null && swapMin !== null && settled;
  const rateText = swapOut !== null && amt > 0
    ? side === 'buy' ? `1 ${sCoin.t} = ${(swapOut / amt).toFixed(4)} DFiUSD` : `1 DFiUSD = ${(swapOut / amt).toFixed(4)} ${sCoin.t}`
    : mid ? (side === 'buy' ? `1 ${sCoin.t} ≈ ${(1 / mid).toFixed(4)} DFiUSD` : `1 DFiUSD ≈ ${mid.toFixed(4)} ${sCoin.t}`) : '—';

  /* ---------- mint & redeem: rebalance with one coin (exact contract maths, lib/rebalance.ts) ---------- */
  const roomNum = COINS.map(c => (rebState ? toNum(room(rebState, c.address, dir), c.decimals) : 0));
  // Coins the reserve accepts right now: short of target for a mint, over target for a redeem. Ignore dust under a cent.
  const open = roomNum.map(r => r > 0.01);
  const anyOpen = open.some(Boolean);
  const firstOpen = open.findIndex(Boolean);
  const rIdx = rebIdx !== null && open[rebIdx] ? rebIdx : firstOpen >= 0 ? firstOpen : 0;
  const rCoin = COINS[rIdx];
  const rRoom = open[rIdx] ? down2(roomNum[rIdx]) : 0;
  function rebalancing() { return tab === 'contribute' && method === 'rebalance'; }
  const rebUnits = raw !== null ? raw / 10n ** BigInt(18 - rCoin.decimals) : 0n;
  const rq = rebState && rebUnits > 0n ? quoteRebalance(rebState, rCoin.address, dir, rebUnits) : null;
  const reward = rq?.ok ? toNum(rq.reward, 18) : 0;
  const rebDfi = rq?.ok ? toNum(rq.dfi, 18) : 0; // mint: DFiUSD you get; redeem: DFiUSD you burn
  let rebErr = '';
  if (rebalancing() && raw && ready) {
    if (rq && !rq.ok) rebErr = rq.reason === 'size-limit' ? 'the reserve is at its size limit right now.' : rq.reason === 'revert' ? 'the contract would reject this amount. try a smaller one.' : `the reserve takes up to ${f2(rRoom)} ${rCoin.t} right now.`;
    else if (dir === 'mint' && rebUnits > coinBals[rIdx]) rebErr = 'amount is above your balance.';
    else if (dir === 'redeem' && rq?.ok && rq.dfi > dfiBal) rebErr = 'amount is above your DFiUSD balance.';
  }
  const rebValid = rebalancing() && anyOpen && !!rq?.ok && !rebErr && ready && (dir === 'redeem' || mintEnabled);

  /* ---------- mint & redeem: the full basket (mint() / burn()), quoted exactly by ReserveManagerHelpers ---------- */
  const basket = tab === 'contribute' && method === 'basket';
  const isMint = basket && dir === 'mint';
  const quoteArgs = [dRaw && dRaw > 0n ? dRaw : 0n] as const;
  const mintQ = useReadContract({ address: HELPERS_ADDR, abi: helpersAbi, functionName: 'quoteMint', args: quoteArgs, chainId: 1, query: { enabled: mounted && isMint && quoteArgs[0] > 0n, refetchInterval: 30_000, retry: false } });
  const burnQ = useReadContract({ address: HELPERS_ADDR, abi: helpersAbi, functionName: 'quoteBurn', args: quoteArgs, chainId: 1, query: { enabled: mounted && basket && !isMint && quoteArgs[0] > 0n, refetchInterval: 30_000, retry: false } });
  const basketQ = isMint ? mintQ : burnQ;
  // wagmi keys each quote by its amount, so data here always belongs to the debounced amount; `settled` ties it to the typed one.
  const quoteFresh = settled && !!basketQ.data;
  const byAddr = (list?: readonly { assetAddress: Address; amount: bigint }[]) =>
    COINS.map(c => ({ coin: c, decimals: c.decimals, amount: list?.find(x => x.assetAddress.toLowerCase() === c.address.toLowerCase())?.amount ?? 0n }));
  const deposits = isMint && quoteFresh && mintQ.data ? byAddr(mintQ.data[0]) : [];
  const payouts = !isMint && basket && quoteFresh && burnQ.data ? byAddr(burnQ.data[0]) : [];
  const shortfalls = deposits.filter((dp, i) => dp.amount > coinBals[i]);
  const mintPaused = dir === 'mint' && !mintEnabled;
  let error = '';
  if (raw !== null && raw === 0n) error = 'enter an amount above zero.';
  else if (basket && raw && ready && (isMint ? shortfalls.length > 0 : raw > dfiBal)) error = 'amount is above your balance.';
  else if (basket && raw && settled && basketQ.isError && !mintPaused)
    error = String(basketQ.error?.message ?? '').includes('max reserves') ? 'the reserve is at its size limit right now.' : 'couldn’t get an exact quote. try again in a moment.';
  const valid = basket && !!raw && raw > 0n && !error && ready && quoteFresh && !(isMint && mintPaused);
  const depositTotal = deposits.reduce((a, dp) => a + toNum(dp.amount, dp.decimals), 0);
  const mintFeeAmt = isMint && mintQ.data ? toNum(mintQ.data[1], 18) : 0;
  const redeem = { net: payouts.reduce((a, p) => a + toNum(p.amount, p.decimals), 0), parts: payouts.map(p => toNum(p.amount, p.decimals)), fee: burnQ.data ? toNum(burnQ.data[1], 18) : 0 };
  const maxRaw = isMint ? maxMint(coinBals, targets, compFeeQ) : dfiBal;
  const approvalsNeeded = isMint ? deposits.filter((dp, i) => dp.amount > allowances[i]).length : 0;
  const feePct = (isMint ? mintFee : burnFee) * 100;
  const feeText = `${feePct.toFixed(2)}%` + (valid ? ' · ' + f2(isMint ? mintFeeAmt : redeem.fee) + ' DFiUSD' : '');

  /* ---------- review summary, per route ---------- */
  const rebNeedsApproval = dir === 'mint' && rebUnits > allowances[rIdx];
  const summary = tab === 'swap'
    ? { title: 'review your swap.', kind: (side === 'buy' ? 'BUY' : 'SELL') as ActivityRow['kind'], in: `${f2(amt)} ${inT}`, out: `${f2(swapOut ?? 0)} ${outT}`, extra: '', requests: [needErc20 && `approve ${inT}`, needPermit && 'sign', 'swap'].filter(Boolean).join(' + ') }
    : rebalancing()
    ? dir === 'mint'
      ? { title: 'review your rebalance.', kind: 'MINT' as const, in: `${f2(amt)} ${rCoin.t}`, out: `${f2(rebDfi)} DFiUSD`, extra: reward > 0 ? `${f2(reward)} DFiUSD reward` : 'none right now', requests: rebNeedsApproval ? `approve ${rCoin.t} + deposit` : 'deposit' }
      : { title: 'review your rebalance.', kind: 'REDEEM' as const, in: `${f2(rebDfi)} DFiUSD`, out: `${f2(amt)} ${rCoin.t}`, extra: reward > 0 ? `${f2(reward)} DFiUSD less to burn` : 'none right now', requests: 'withdraw' }
    : isMint
      ? { title: 'review your mint.', kind: 'MINT' as const, in: `${valid ? f2(depositTotal) : '0.00'} across the basket`, out: `${f2(valid ? amt : 0)} DFiUSD`, extra: '', requests: approvalsNeeded ? `${approvalsNeeded} approval${approvalsNeeded > 1 ? 's' : ''} + mint` : 'mint' }
      : { title: 'review your redemption.', kind: 'REDEEM' as const, in: `${valid ? f2(amt) : '0.00'} DFiUSD`, out: `${f2(valid ? redeem.net : 0)} across the basket`, extra: '', requests: 'redeem' };

  /* ---------- activity: this wallet's DFiUSD movements, from our /api/activity route (Alchemy, server side) ---------- */
  const loadHistory = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`/api/activity?address=${address}`);
      if (!r.ok) throw new Error(String(r.status));
      const { rows } = (await r.json()) as { rows: ActivityRow[] };
      setHistory(rows.slice(0, 8).map(row => {
        const v = `${f2(Number(row.value))} DFiUSD`;
        return {
          kind: row.kind, hash: row.hash,
          amt: row.kind === 'MINT' || row.kind === 'BUY' || row.kind === 'IN' ? `+ ${v}` : `− ${v}`,
          when: row.ts ? new Date(row.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '',
        };
      }));
      setHistoryErr(false);
    } catch { setHistoryErr(true); }
  }, [address]);
  useEffect(() => { if (connected && !wrongNet) loadHistory(); else setHistory([]); }, [connected, wrongNet, loadHistory]);

  /* ---------- write flow ---------- */
  const canReview = (rebValid || valid || swapValid) && safe;
  // Re-run every safety check right before the wallet opens: network, pause switch, contracts. Returns a reason to stop, or ''.
  const preflight = async () => {
    if (chainId !== CHAIN_ID) return 'Your wallet is not on Ethereum mainnet. Switch networks and try again.';
    const [p, g] = await Promise.all([loadPause(), guardReads.refetch()]);
    const fresh = evaluateGuard(guardInput(g.data, p));
    return fresh.state === 'ok' ? '' : fresh.reason;
  };
  const confirm = async () => {
    if (!canReview || !raw || !client) return;
    setPending(true); setRejected(false); setFailed('');
    const stop = await preflight();
    if (stop) { setFailed(stop); setPending(false); showToast({ color: 'var(--crit)', text: 'stopped before signing: safety check failed.', word: 'STOPPED' }, 6000); return; }
    const waitTx = async (hash: Hash) => { await client.waitForTransactionReceipt({ hash }); return hash; };
    // USDT reverts on changing a non-zero allowance; reset it first.
    const approve = async (i: number, units: bigint) => {
      const c = COINS[i];
      if (c.t === 'USDT' && allowances[i] > 0n) await waitTx(await writeContractAsync({ address: c.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, 0n], chainId: 1 }));
      await waitTx(await writeContractAsync({ address: c.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, units], chainId: 1 }));
    };
    try {
      let hash: Hash;
      let received = '';
      if (tab === 'swap') {
        const units = swapUnits;
        const key = sKey;
        // 1. A fresh quote and fresh price right now; the same limits as the form are checked again.
        const [[q], s0, block] = await Promise.all([
          client.readContract({ address: V4.quoter, abi: v4QuoterAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: key, zeroForOne: zeroForOne(key, tokenIn), exactAmount: units, hookData: '0x' }] }),
          client.readContract({ address: V4.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId(key)] }),
          client.getBlock(),
        ]);
        const outNum = toNum(q, side === 'buy' ? 18 : sCoin.decimals);
        const m = dfiPrice(key, s0[0], sCoin.decimals);
        const imp = 1 - outNum / (side === 'buy' ? amt / m : amt * m);
        if (outNum / amt < MIN_RATE || imp > MAX_IMPACT) throw Object.assign(new Error('limits'), { userMessage: 'the price moved past the safety limits. nothing was sent.' });
        if (outNum < (swapOut ?? 0) * (1 - Number(SLIPPAGE_BPS) / 10_000)) throw Object.assign(new Error('moved'), { userMessage: 'the price moved since your review. go back to see the new quote.' });
        const minAmountOut = minOut(q);
        const now = Number(block.timestamp);
        const steps = (needErc20 ? 1 : 0) + (needPermit ? 1 : 0) + 1;
        let n = 0;
        // 2. Exact approval of the coin to Permit2 (USDT needs a reset to zero first).
        const a = await client.readContract({ address: tokenIn, abi: erc20Abi, functionName: 'allowance', args: [address!, PERMIT2] });
        if (a < units) {
          showToast({ color: 'var(--warn)', text: `approve ${inT} in your wallet · ${++n} of ${steps}`, word: 'WAITING' });
          if (sCoin.t === 'USDT' && side === 'buy' && a > 0n) await waitTx(await writeContractAsync({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, 0n], chainId: 1 }));
          await waitTx(await writeContractAsync({ address: tokenIn, abi: erc20Abi, functionName: 'approve', args: [PERMIT2, units], chainId: 1 }));
        }
        // 3. Permission for the router: a signature for exactly this amount, 30 minutes. Smart-account wallets
        //    (code at the address) approve on-chain instead, since their signatures are checked differently.
        const [p2amt, p2exp, nonce] = await client.readContract({ address: PERMIT2, abi: permit2Abi, functionName: 'allowance', args: [address!, tokenIn, UNIVERSAL_ROUTER] });
        let permit: Parameters<typeof buildSwap>[0]['permit'];
        if (p2amt < units || p2exp <= now + DEADLINE_S) {
          const smart = ((await client.getCode({ address: address! })) ?? '0x').length > 2;
          if (smart) {
            showToast({ color: 'var(--warn)', text: `allow the swap in your wallet · ${++n} of ${steps}`, word: 'WAITING' });
            await waitTx(await writeContractAsync({ address: PERMIT2, abi: permit2Abi, functionName: 'approve', args: [tokenIn, UNIVERSAL_ROUTER, units, now + PERMIT_TTL_S], chainId: 1 }));
          } else {
            showToast({ color: 'var(--warn)', text: `sign the permission in your wallet · ${++n} of ${steps}`, word: 'WAITING' });
            const td = permitTypedData(tokenIn, units, Number(nonce), now);
            permit = { message: td.message, signature: await signTypedDataAsync(td) };
          }
        }
        // 4. Build, simulate (stops here if anything would fail), then send.
        const args = buildSwap({ key, tokenIn, tokenOut, amountIn: units, minAmountOut, now, permit });
        await client.simulateContract({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args, account: address! });
        showToast({ color: 'var(--warn)', text: `confirm the swap in your wallet · ${++n} of ${steps}`, word: 'WAITING' });
        hash = await writeContractAsync({ address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: 'execute', args, chainId: 1 });
      } else if (rebalancing()) {
        if (rebNeedsApproval) {
          showToast({ color: 'var(--warn)', text: `approve ${rCoin.t} in your wallet · 1 of 2`, word: 'WAITING' });
          await approve(rIdx, rebUnits);
        }
        showToast({ color: 'var(--warn)', text: 'confirm in your wallet.', word: 'WAITING' });
        hash = await writeContractAsync({ ...RM, functionName: 'swapTowardsTarget', args: [rCoin.address, dir === 'mint' ? rebUnits : -rebUnits], chainId: 1 });
      } else if (isMint) {
        const need = deposits.map((dp, i) => ({ ...dp, i })).filter(dp => dp.amount > allowances[dp.i]);
        for (let k = 0; k < need.length; k++) {
          showToast({ color: 'var(--warn)', text: `approve ${need[k].coin.t} in your wallet · ${k + 1} of ${need.length}`, word: 'WAITING' });
          await approve(need[k].i, need[k].amount);
        }
        showToast({ color: 'var(--warn)', text: 'confirm in your wallet.', word: 'WAITING' });
        hash = await writeContractAsync({ ...RM, functionName: 'mint', args: [raw, '0x'], chainId: 1 });
      } else {
        showToast({ color: 'var(--warn)', text: 'confirm in your wallet.', word: 'WAITING' });
        hash = await writeContractAsync({ ...RM, functionName: 'burn', args: [raw, false, '0x'], chainId: 1 });
      }
      showToast({ color: 'var(--warn)', text: 'waiting for the block.', word: 'PENDING' });
      const r = await client.waitForTransactionReceipt({ hash });
      if (r.status !== 'success') throw new Error('reverted');
      if (tab === 'swap') {
        // What actually arrived, read from the receipt.
        const got = parseEventLogs({ abi: erc20Abi, logs: r.logs, eventName: 'Transfer' })
          .filter(l => l.address.toLowerCase() === tokenOut.toLowerCase() && l.args.to.toLowerCase() === address!.toLowerCase())
          .reduce((t, l) => t + l.args.value, 0n);
        received = `${f2(toNum(got, side === 'buy' ? 18 : sCoin.decimals))} ${outT}`;
      }
      const title = tab === 'swap' ? 'swap confirmed.' : dir === 'mint' ? (rebalancing() ? 'rebalance confirmed.' : 'mint confirmed.') : (rebalancing() ? 'rebalance confirmed.' : 'redemption confirmed.');
      setDone({ at: Date.now(), hash, sumIn: summary.in, sumOut: received || summary.out, title, inLabel: tab === 'swap' ? 'you paid' : dir === 'mint' ? 'you added' : 'you redeemed' });
      setHistory(h => [{ kind: summary.kind, hash, amt: tab === 'swap' ? (side === 'buy' ? `+ ${received || summary.out}` : `− ${summary.in}`) : dir === 'mint' ? `+ ${summary.out}` : `− ${summary.in}`, when: 'just now' }, ...h]);
      setStep('done');
      showToast({ color: 'var(--ok)', text: title, word: 'CONFIRMED' }, 5000);
      reads.refetch();
    } catch (e) {
      if (isRejection(e)) {
        setRejected(true);
        showToast({ color: 'var(--crit)', text: 'request rejected in wallet.', word: 'REJECTED' }, 4000);
      } else if ((e as { userMessage?: string }).userMessage) {
        setFailed((e as { userMessage: string }).userMessage);
        showToast({ color: 'var(--crit)', text: 'stopped before sending.', word: 'STOPPED' }, 6000);
      } else {
        setFailed(tab === 'swap' ? 'the swap didn’t go through. your coins didn’t move, apart from any approval you confirmed.' : 'the transaction didn’t go through. nothing was minted or redeemed.');
        showToast({ color: 'var(--crit)', text: 'transaction failed.', word: 'FAILED' }, 6000);
      }
      reads.refetch();
    } finally {
      setPending(false);
    }
  };

  const onAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/[^0-9.]/g, '');
    const i = v.indexOf('.');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
    setAmount(v);
  };
  const fill = (n: number) => setAmount(down2(Math.max(0, n)).toFixed(2));
  const clear = () => { setAmount(''); setFailed(''); };
  const goTab = (t: Tab) => { setTab(t); clear(); };
  const goDir = (d: 'mint' | 'redeem') => { setDir(d); setRebIdx(null); clear(); };
  const reset = () => { setStep('amount'); setAmount(''); setToast(null); setRejected(false); setDone(null); };

  const walletLabel = connected ? short(address) : 'connect wallet';
  // Dev-only preview wallet (see lib/wagmi.ts).
  useEffect(() => {
    const m = PREVIEW_ADDR && connectors.find(k => k.id === 'mock');
    if (m && !isConnected) connect({ connector: m, chainId: 1 });
  }, [connectors, isConnected, connect]);

  // A wallet that fails to connect (QR code expired, request closed, wallet not installed) shows a calm message, not an error.
  const connectFailed = useCallback((e: unknown) => {
    const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
    if (msg.includes('expired')) showToast({ color: 'var(--warn)', text: 'the QR code expired. tap WalletConnect to get a new one.', word: 'EXPIRED' }, 6000);
    else if (isRejection(e) || msg.includes('reject') || msg.includes('closed')) showToast({ color: 'var(--dim)', text: 'connection cancelled.', word: 'CANCELLED' }, 4000);
    else showToast({ color: 'var(--crit)', text: 'couldn’t connect that wallet. try again or pick another.', word: 'FAILED' }, 6000);
  }, []);
  // WalletConnect also rejects an expired pairing outside our call; catch that one here so it never shows as a crash.
  useEffect(() => {
    const onReject = (ev: PromiseRejectionEvent) => {
      if (String(ev.reason?.message ?? ev.reason).includes('Proposal expired')) { ev.preventDefault(); connectFailed(ev.reason); }
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, [connectFailed]);

  const pick = (id: string) => {
    const c = connectors.find(k => k.id === id);
    if (c) connect({ connector: c, chainId: 1 }, { onError: connectFailed });
    // WalletConnect without a project ID has no connector yet.
    else showToast({ color: 'var(--warn)', text: 'WalletConnect is being switched on. Use MetaMask or Coinbase Wallet for now.', word: 'SOON' }, 5000);
  };

  const inputStyle = (bad: boolean) => ({ borderColor: bad ? 'var(--crit)' : focus ? 'var(--fg)' : 'var(--strong)', boxShadow: focus ? '0 0 0 3px var(--bg), 0 0 0 5px var(--signal)' : 'none' });
  const amountInput = (bad: boolean, label: string) => (
    <input id="amount" aria-label={label} value={amount} onChange={onAmount} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      inputMode="decimal" autoComplete="off" placeholder="0.00" aria-invalid={bad} aria-describedby={bad ? 'amount-err' : undefined} />
  );
  // Balance line: clicking the balance fills it in; an error sits right beside it.
  const balLine = (text: string, n: number, err: string) => (
    <div className={s.balRow}>
      <span className={s.balLeft}>
        <button type="button" className={s.balBtn} onClick={() => fill(n)} disabled={!ready}>{text}</button>
        {err && <span id="amount-err" role="alert" className={s.balErr}>{err}</span>}
      </span>
      <button type="button" className={s.max} onClick={() => fill(n)} disabled={!ready}>max</button>
    </div>
  );

  /* Basket side of the full-basket boxes: a tag, and the per-coin amounts inside the box. */
  const BasketTag = () => <span className={s.unit}><MiniBar width={22} height={8} gap={1} radius={1} />basket</span>;
  const MixList = () => (
    <div className={s.boxMix}>
      {COINS.map((c, i) => {
        const dp = deposits[i];
        const low = isMint && dp && dp.amount > coinBals[i] && ready;
        const val = isMint ? (dp && dp.amount > 0n ? f2(toNum(dp.amount, dp.decimals)) : '0.00') : f2(redeem.parts[i] ?? 0);
        return (
          <div key={c.t} className={s.mixRow}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="sw" style={{ background: c.color }} />{c.t}
              <span style={{ fontSize: 12 }} className="dim">{isMint ? `balance ${ready ? f2(down2(usdBal(i))) : '—'}` : reading.coins[i].current.toFixed(1) + '%'}</span>
            </span>
            <span style={{ fontWeight: 600, color: low ? 'var(--crit)' : quoteFresh ? 'var(--fg)' : 'var(--dim)' }}>{val}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={s.page}>
      <nav aria-label="app" className={s.nav}>
        <div className={`wrap ${s.navIn}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <Link href="/" aria-label="DiversiFi home" className={s.logo}><Wordmark /></Link>
            <div className={s.navLinks}>
              <span aria-current="page" className={s.current}>app</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={s.net} style={wrongNet ? { color: 'var(--warn)', borderColor: 'var(--warn)' } : undefined}>{wrongNet ? 'WRONG NETWORK' : 'ETHEREUM'}</span>
            <button
              type="button"
              className={connected ? s.walletOn : `btn btn-primary btn-nav ${s.walletOff}`}
              onClick={() => (connected ? (disconnect(), reset()) : document.getElementById('wallets')?.querySelector('button')?.focus())}
              aria-label={connected ? `connected as ${address}. disconnect` : undefined}
            >{walletLabel}</button>
          </div>
        </div>
      </nav>

      <main className={s.main}>
        <h1 className="sr-only">swap, mint and redeem DFiUSD</h1>
        <section aria-label="swap, mint and redeem" className={s.flow}>
          {view === 'connect' && (
            <div className={s.connect}>
              <Mark size={72} />
              <p className="h3" style={{ maxWidth: '18em' }}>connect a wallet to swap, mint or redeem DFiUSD.</p>
              <div id="wallets" className={s.wallets}>
                {WALLETS.map(w => (
                  <button key={w.id} type="button" className={s.walletRow} onClick={() => pick(w.id)} disabled={connecting}>
                    <span>{w.name}</span><span className={s.kind}>{w.kind}</span>
                  </button>
                ))}
              </div>
              <p className="foot">Ethereum mainnet only. Connecting doesn&apos;t move any funds.</p>
            </div>
          )}

          {view === 'wrong-network' && (
            <div className={s.col} style={{ flex: 1 }}>
              <div className="rail"><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warn)' }}><i className="dot" style={{ background: 'var(--warn)' }} />WRONG NETWORK</span><span>{short(address)}</span></div>
              <p className="h3">your wallet is on another network.</p>
              <p className="dim pretty">DFiUSD and the reserve contract are on Ethereum mainnet. Switch networks in your wallet to continue.</p>
              <dl className={s.dl}>
                <div><dt>wallet network</dt><dd className="mono" style={{ color: 'var(--warn)' }}>{CHAIN_NAMES[chainId ?? 0] ?? `chain ${chainId}`}</dd></div>
                <div><dt>required</dt><dd className="mono">Ethereum mainnet</dd></div>
              </dl>
              <div className={s.btnRow}>
                <button type="button" className={`btn btn-secondary ${s.b52}`} style={{ flex: 1 }} onClick={() => disconnect()}>disconnect</button>
                <button type="button" className={`btn btn-primary ${s.b52}`} style={{ flex: 2 }} onClick={() => switchChain({ chainId: 1 })}>switch to Ethereum</button>
              </div>
            </div>
          )}

          {view !== 'connect' && guard.state === 'blocked' && (
            <p role="alert" className={s.guardBanner}><strong>transactions are switched off.</strong> {guard.reason}</p>
          )}

          {view === 'amount' && (
            <div className={s.col}>
              <div role="tablist" aria-label="mode" className={s.tabs}>
                <button type="button" role="tab" aria-selected={tab === 'swap'} className={tab === 'swap' ? s.tabOn : undefined} onClick={() => goTab('swap')}>
                  swap
                </button>
                <button type="button" role="tab" aria-selected={tab === 'contribute'} className={tab === 'contribute' ? s.tabOn : undefined} onClick={() => goTab('contribute')}>mint &amp; redeem</button>
              </div>

              {/* ---------- SWAP: one coin in or out at market, like a DEX ---------- */}
              {tab === 'swap' && (
                <>
                  <p className={s.lead}>Trade one coin for DFiUSD, or back, in one step, through the DFiUSD pools on Uniswap.</p>
                  {/* pay and receive as two boxes that almost touch, with the flip button on the seam, like a DEX */}
                  <div className={s.pair}>
                    <div className={s.box} style={inputStyle(!!swapErr)}>
                      <label htmlFor="amount" className={s.flabel}>you pay</label>
                      <div className={s.boxRow}>
                        {amountInput(!!swapErr, 'you pay')}
                        {side === 'buy'
                          ? <CoinPick id="swapcoin" label="pay with" value={String(sIdx)} onChange={v => setSwapIdx(Number(v))} options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color, note: ready ? f2(down2(usdBal(i))) : '' }))} />
                          : <DfiTag />}
                      </div>
                      {balLine(`balance ${ready ? f2(down2(swapPayBal)) : '—'} ${side === 'buy' ? sCoin.t : 'DFiUSD'}`, swapPayBal, swapErr)}
                    </div>

                    <button type="button" className={s.flip} aria-label="switch what you pay and what you receive" onClick={() => { setSide(side === 'buy' ? 'sell' : 'buy'); clear(); }}>
                      <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" /></svg>
                    </button>

                    <div className={`${s.box} ${s.boxOut}`}>
                      <span className={s.flabel}>you receive</span>
                      <div className={s.boxRow}>
                        <span className={s.quoteAmt} style={{ color: swapOut !== null ? 'var(--fg)' : 'var(--strong)' }}>{swapOut !== null ? f2(swapOut) : amt > 0 && !swapErr ? '…' : '0.00'}</span>
                        {side === 'sell'
                          ? <CoinPick id="swapcoin" label="receive" value={String(sIdx)} onChange={v => setSwapIdx(Number(v))} options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color }))} />
                          : <DfiTag />}
                      </div>
                    </div>
                  </div>

                  <dl className={s.dl} style={{ fontSize: 14 }}>
                    <div><dt>rate</dt><dd className="mono">{rateText}</dd></div>
                    <div><dt>price impact</dt><dd className="mono" style={{ color: impact !== null && impact > WARN_IMPACT ? 'var(--warn)' : undefined }}>{impact !== null ? (impact < 0.0001 ? '< 0.01%' : (impact * 100).toFixed(2) + '%') : '—'}</dd></div>
                    <div><dt>minimum received</dt><dd className="mono">{swapMin !== null ? `${f2(toNum(swapMin, side === 'buy' ? 18 : sCoin.decimals))} ${outT}` : '—'}</dd></div>
                    <div><dt>fee</dt><dd className="mono">0.01% Uniswap pool fee · no DiversiFi fee</dd></div>
                  </dl>

                  <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!swapValid || !safe} onClick={() => swapValid && safe && setStep('review')}>review swap</button>
                  <div className={s.alts}>
                    <button type="button" className={s.advLink} onClick={() => goTab('contribute')}>or mint &amp; redeem with the reserve directly →</button>
                  </div>
                </>
              )}

              {/* ---------- MINT & REDEEM: work with the reserve contract, laid out like swap ---------- */}
              {tab === 'contribute' && (
                <>
                  <div role="radiogroup" aria-label="how" className={s.methods}>
                    <button type="button" role="radio" aria-checked={method === 'rebalance'} className={`${s.method} ${method === 'rebalance' ? s.methodOn : ''}`} onClick={() => { setMethod('rebalance'); clear(); }}>
                      <span className={s.methodTitle}>one coin · rebalance</span>
                      <span className={s.methodBody}>{dir === 'mint' ? 'Add a coin the reserve is short of.' : 'Take out a coin the reserve has too much of.'} Earn from the reward pool.</span>
                    </button>
                    <button type="button" role="radio" aria-checked={method === 'basket'} className={`${s.method} ${method === 'basket' ? s.methodOn : ''}`} onClick={() => { setMethod('basket'); clear(); }}>
                      <span className={s.methodTitle}>the full basket</span>
                      <span className={s.methodBody}>{dir === 'mint' ? 'Deposit every basket coin at the target split.' : 'Receive the current mix of every coin.'} Always available.</span>
                    </button>
                  </div>

                  {mintPaused && dir === 'mint' && <p className={s.note} style={{ color: 'var(--warn)' }}>minting is paused right now. redeeming still works: tap ⇅ to switch.</p>}

                  {/* one coin, rebalancing. Balanced: the form stays visible but greyed out, with a short note above it */}
                  {method === 'rebalance' && !anyOpen && (
                    <p className={s.note}>
                      <strong>the basket is balanced right now.</strong>{' '}
                      <button type="button" className={s.inlineLink} onClick={() => { setMethod('basket'); clear(); }}>use the full basket →</button>
                    </p>
                  )}
                  {method === 'rebalance' && (
                    <fieldset className={s.fs} disabled={!anyOpen}>
                      <div className={s.pair}>
                        <div className={s.box} style={inputStyle(!!rebErr)}>
                          <div className={s.fieldHead}>
                            <label htmlFor="amount" className={s.flabel}>{dir === 'mint' ? 'you add' : 'you give'}</label>
                            <span className={s.room}>{anyOpen ? `reserve ${dir === 'mint' ? 'takes' : 'releases'} up to ${f2(rRoom)} ${rCoin.t}` : 'every coin on target'}</span>
                          </div>
                          <div className={s.boxRow}>
                            {amountInput(!!rebErr, dir === 'mint' ? 'you add' : 'you give')}
                            {dir === 'mint'
                              ? <CoinPick id="rebcoin" label="coin to add" value={String(rIdx)} onChange={v => { setRebIdx(Number(v)); clear(); }}
                                  options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color, disabled: !open[i], note: open[i] ? `up to ${f2(down2(roomNum[i]))}` : 'on target' }))} />
                              : <DfiTag />}
                          </div>
                          {dir === 'mint'
                            ? balLine(`balance ${ready ? f2(down2(usdBal(rIdx))) : '—'} ${rCoin.t}`, Math.min(usdBal(rIdx), rRoom), rebErr)
                            : balLine(`balance ${ready ? f2(down2(dfiNum)) : '—'} DFiUSD`, Math.min(rRoom, dfiNum), rebErr)}
                        </div>

                        <button type="button" className={s.flip} aria-label={dir === 'mint' ? 'switch to redeem' : 'switch to mint'} onClick={() => goDir(dir === 'mint' ? 'redeem' : 'mint')}>
                          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" /></svg>
                        </button>

                        <div className={`${s.box} ${s.boxOut}`}>
                          <span className={s.flabel}>{dir === 'mint' ? 'you get' : 'you receive'}</span>
                          <div className={s.boxRow}>
                            <span className={s.quoteAmt} style={{ color: amt > 0 && rq?.ok ? 'var(--fg)' : 'var(--strong)' }}>{amt > 0 && rq?.ok ? f2(dir === 'mint' ? rebDfi : amt) : '0.00'}</span>
                            {dir === 'mint'
                              ? <DfiTag />
                              : <CoinPick id="rebcoin" label="coin to take out" value={String(rIdx)} onChange={v => { setRebIdx(Number(v)); clear(); }}
                                  options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color, disabled: !open[i], note: open[i] ? `up to ${f2(down2(roomNum[i]))}` : 'on target' }))} />}
                          </div>
                        </div>
                      </div>

                      <dl className={s.dl} style={{ fontSize: 14 }}>
                        <div><dt>rate</dt><dd className="mono">1 {rCoin.t} = 1 DFiUSD · no fee</dd></div>
                        <div><dt>your reward</dt><dd className="mono" style={{ color: reward > 0 ? 'var(--ok)' : undefined }}>{reward > 0 ? (dir === 'mint' ? `+ ${f2(reward)} DFiUSD` : `${f2(reward)} DFiUSD less to give`) : bounty > 0 ? '—' : 'pool empty right now'}</dd></div>
                        <div><dt>reward pool</dt><dd className="mono">{f2(bounty)} DFiUSD</dd></div>
                      </dl>
                      <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!rebValid || !safe} onClick={() => rebValid && safe && setStep('review')}>review {dir === 'mint' ? 'mint' : 'redeem'}</button>
                    </fieldset>
                  )}

                  {/* the full basket */}
                  {method === 'basket' && (
                    <>
                      <div className={s.pair}>
                        <div className={s.box} style={inputStyle(!!error)}>
                          <label htmlFor="amount" className={s.flabel}>{isMint ? 'you add (value in DFiUSD)' : 'you give'}</label>
                          <div className={s.boxRow}>
                            {amountInput(!!error, isMint ? 'value to add' : 'you give')}
                            {isMint ? <BasketTag /> : <DfiTag />}
                          </div>
                          {isMint
                            ? balLine(`you can mint up to ${ready ? f2(down2(toNum(maxRaw, 18))) : '—'}`, toNum(maxRaw, 18), error)
                            : balLine(`balance ${ready ? f2(down2(dfiNum)) : '—'} DFiUSD`, dfiNum, error)}
                          {isMint && <MixList />}
                        </div>

                        <button type="button" className={s.flip} aria-label={dir === 'mint' ? 'switch to redeem' : 'switch to mint'} onClick={() => goDir(dir === 'mint' ? 'redeem' : 'mint')}>
                          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 2.5v11M2.5 11 5 13.5 7.5 11M11 13.5v-11M8.5 5 11 2.5 13.5 5" /></svg>
                        </button>

                        <div className={`${s.box} ${s.boxOut}`}>
                          <span className={s.flabel}>{isMint ? 'you get' : 'you receive'}</span>
                          <div className={s.boxRow}>
                            <span className={s.quoteAmt} style={{ color: valid ? 'var(--fg)' : 'var(--strong)' }}>{valid ? f2(isMint ? amt : redeem.net) : '0.00'}</span>
                            {isMint ? <DfiTag /> : <BasketTag />}
                          </div>
                          {!isMint && <MixList />}
                        </div>
                      </div>

                      <dl className={s.dl} style={{ fontSize: 14 }}>
                        <div><dt>{isMint ? 'mint fee' : 'redeem fee'}</dt><dd className="mono">{feeText}</dd></div>
                        {isMint && <div><dt>approvals</dt><dd className="mono">{valid ? (approvalsNeeded ? `${approvalsNeeded} of ${COINS.length} coins` : 'none needed') : '—'}</dd></div>}
                      </dl>
                      <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!valid || !safe} onClick={() => valid && safe && setStep('review')}>review {isMint ? 'mint' : 'redeem'}</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {view === 'review' && (
            <div className={s.col}>
              <div className="rail"><span>REVIEW · {tab === 'swap' ? 'SWAP' : dir === 'mint' ? 'MINT' : 'REDEEM'}{rebalancing() ? ' · REBALANCE' : ''}</span><span>STEP 2 OF 2</span></div>
              <p className="h3">{summary.title}</p>
              {tab === 'swap' ? (
              <dl className={s.dl}>
                <div><dt>you pay</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.in}</dd></div>
                <div><dt>you receive</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.out}</dd></div>
                <div><dt>minimum received</dt><dd className="mono">{swapMin !== null ? `${f2(toNum(swapMin, side === 'buy' ? 18 : sCoin.decimals))} ${outT}` : '—'}</dd></div>
                <div><dt>price impact</dt><dd className="mono" style={{ color: impact !== null && impact > WARN_IMPACT ? 'var(--warn)' : undefined }}>{impact !== null ? (impact < 0.0001 ? '< 0.01%' : (impact * 100).toFixed(2) + '%') : '—'}</dd></div>
                <div><dt>fee</dt><dd className="mono">0.01% Uniswap pool fee</dd></div>
                <div><dt>wallet requests</dt><dd className="mono">{summary.requests}</dd></div>
              </dl>
              ) : (
              <dl className={s.dl}>
                <div><dt>{dir === 'mint' ? (rebalancing() ? 'you add' : 'you deposit') : 'you redeem'}</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.in}</dd></div>
                {rebalancing() && <div><dt>reward</dt><dd className="mono" style={{ color: reward > 0 ? 'var(--ok)' : undefined }}>{summary.extra}</dd></div>}
                {!rebalancing() && <div><dt>{isMint ? 'mint fee' : 'redeem fee'}</dt><dd className="mono">{feeText}</dd></div>}
                <div><dt>wallet requests</dt><dd className="mono">{summary.requests}</dd></div>
                <div><dt>you receive</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.out}</dd></div>
              </dl>
              )}
              {basket && !isMint && valid && (
                <div className={s.mix}>
                  {COINS.map((c, i) => (
                    <div key={c.t} className={s.mixRow}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><i className="sw" style={{ background: c.color }} />{c.t}</span>
                      <span style={{ fontWeight: 600 }}>{f2(redeem.parts[i] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {rejected && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>you rejected the request in your wallet. nothing was sent.</p>}
              {failed && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>{failed}</p>}
              <p className="foot">{tab === 'swap' ? `Swaps run through Uniswap's official router. Approvals cover exactly this amount. If the price drops more than ${Number(SLIPPAGE_BPS) / 100}% before your swap lands, it cancels itself and only the network fee is spent.` : rebalancing() ? 'Worked out with the contract’s own maths from the reserve as it is now. If someone rebalances first, the reward can be smaller.' : 'Fees are read from the contract and already included above.'} Your wallet will ask you to confirm.</p>
              <div className={s.btnRow}>
                <button type="button" className={`btn btn-secondary ${s.b52}`} style={{ flex: 1 }} disabled={pending} onClick={() => { setStep('amount'); setRejected(false); setFailed(''); }}>back</button>
                <button type="button" className={`btn btn-primary ${s.b52}`} style={{ flex: 2 }} disabled={pending} onClick={confirm}>
                  {pending ? 'waiting…' : rejected || failed ? 'try again' : 'confirm'}
                </button>
              </div>
            </div>
          )}

          {view === 'done' && done && (
            <div className={s.col} style={{ flex: 1 }}>
              <div className="rail"><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)' }}><i className="dot" style={{ background: 'var(--ok)' }} />CONFIRMED</span><span>{hhmm(done.at)} UTC</span></div>
              <p style={{ fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.03em' }}>{done.title}</p>
              <dl className={s.dl}>
                <div><dt>{done.inLabel}</dt><dd className="mono">{done.sumIn}</dd></div>
                <div><dt>you received</dt><dd className="mono" style={{ fontWeight: 600 }}>{done.sumOut}</dd></div>
                <div><dt>transaction</dt><dd><a href={txUrl(done.hash)} target="_blank" rel="noopener" className="mono" style={{ fontSize: 14 }}>{short(done.hash)} · etherscan ↗</a></dd></div>
              </dl>
              <div className={s.btnRow}>
                <Link href="/#reserve" className={`btn btn-secondary ${s.b52}`} style={{ flex: 1 }}>check the reserve</Link>
                <button type="button" className={`btn btn-primary ${s.b52}`} style={{ flex: 1 }} onClick={reset}>done</button>
              </div>
            </div>
          )}
        </section>

        <aside aria-label={tab === 'contribute' ? 'how rebalancing works' : 'backing'} className={s.aside}>
          {tab === 'contribute' ? (
            <BasketExplainer reading={reading} dir={dir} bounty={bounty} focusIdx={method === 'rebalance' && anyOpen ? rIdx : -1} amount={method === 'rebalance' ? amt : 0} />
          ) : (
            <>
              <div className="rail"><span>BACKING</span><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}><span className="livedot" />LIVE · {hhmm(reading.readAt)} UTC</span></div>
              <p style={{ fontSize: 'clamp(20px, 2vw, 24px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>every DFiUSD is backed by the whole basket.</p>
              <ReserveBar size="md" readout showTotal={false} status />
              <dl className={s.dl} style={{ fontSize: 14 }}>
                <div><dt>market price</dt><dd className="mono">{peg ? `1 DFiUSD = ${peg.toFixed(4)} USDC` : '—'}</dd></div>
              </dl>
              <Link href="/#reserve" style={{ fontSize: 15 }}>check the reserve →</Link>
            </>
          )}
          {connected && !wrongNet && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <div className="rail"><span>ACTIVITY · THIS WALLET</span><span>{history.length} TX</span></div>
              {history.length === 0 && (
                <p className="foot" style={{ padding: '14px 0' }}>
                  {historyErr ? 'couldn’t load this wallet’s activity right now.' : 'no DFiUSD activity yet.'}{' '}
                  <a href={`${ETHERSCAN}/address/${address}`} target="_blank" rel="noopener">see this wallet on etherscan ↗</a>
                </p>
              )}
              {history.map(h => (
                <a key={h.hash} href={txUrl(h.hash)} target="_blank" rel="noopener" aria-label={`${h.kind.toLowerCase()}, ${h.amt}, ${h.when}. Opens Etherscan.`} className={s.act}>
                  <span className={s.actKind}>{h.kind}</span>
                  <span className={s.actAmt}>{h.amt}</span>
                  <span className={s.actWhen}>{h.when} ↗</span>
                </a>
              ))}
            </div>
          )}
        </aside>
      </main>

      {toast && (
        <div role="status" className={s.toast}>
          <i className="dot" style={{ background: toast.color }} />
          <span>{toast.text}</span>
          <span className={s.toastWord} style={{ color: toast.color }}>{toast.word}</span>
        </div>
      )}

      <footer className={s.footer}>
        <div className={`wrap ${s.footIn}`}>
          <p style={{ maxWidth: '64em' }}>{FOOTNOTE}</p>
          <span className="mono">proof, not promises.</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- how rebalancing works: live basket vs target, plus the three steps ---------- */
function BasketExplainer({ reading, dir, bounty, focusIdx, amount }: { reading: ReserveReading; dir: 'mint' | 'redeem'; bounty: number; focusIdx: number; amount: number }) {
  const g = gaps(reading);
  const max = Math.max(...reading.coins.map(c => Math.max(c.current, c.target))) * 1.15;
  const balanced = g.every(x => Math.abs(x.diff) <= 0.01);
  return (
    <>
      <div className="rail"><span>HOW REBALANCING WORKS</span><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}><span className="livedot" />LIVE</span></div>
      <p style={{ fontSize: 'clamp(20px, 2vw, 24px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>you keep the basket on target. the pool pays you for it.</p>

      {/* Each row: the coin's share now (bar) against its target (tick). The selected coin previews your move. */}
      <div className={s.bk} role="img" aria-label={`Basket now: ${reading.coins.map((c, i) => `${c.t} ${c.current.toFixed(1)}% against a ${c.target.toFixed(1)}% target`).join(', ')}.`}>
        {reading.coins.map((c, i) => {
          const coin = COINS[i];
          const d = g[i].diff;
          const state = Math.abs(d) <= 0.01 ? 'on target' : d > 0 ? `short ${f2(d)}` : `over ${f2(-d)}`;
          const sel = i === focusIdx && amount > 0;
          const after = sel ? ((c.held + (dir === 'mint' ? amount : -amount)) / (reading.total + (dir === 'mint' ? amount : -amount))) * 100 : c.current;
          return (
            <div key={c.t} className={s.bkRow} style={{ opacity: focusIdx >= 0 && i !== focusIdx ? 0.55 : 1 }}>
              <span className={s.bkName}><i className="sw" style={{ background: coin.color }} />{c.t}</span>
              <span className={s.bkTrack}>
                <i className={s.bkNow} style={{ width: `${(c.current / max) * 100}%`, background: coin.color }} />
                {sel && <i className={s.bkAfter} style={{ width: `${(after / max) * 100}%` }} />}
                <i className={s.bkTarget} style={{ left: `${(c.target / max) * 100}%` }} />
              </span>
              <span className={s.bkState} style={{ color: Math.abs(d) <= 0.01 ? 'var(--dim)' : d > 0 ? 'var(--warn)' : 'var(--signal)' }}>{state}</span>
            </div>
          );
        })}
        <div className={s.bkKey}><span><i className={s.bkKeyNow} />share now</span><span><i className={s.bkKeyTarget} />target</span><span><i className={s.bkKeyAfter} />after your move</span></div>
      </div>

      <ol className={s.steps}>
        <li><span><b>coins drift.</b> Redemptions and price moves push a coin above or below its target share.</span></li>
        <li><span><b>you fix the gap.</b> Mint by adding a coin the reserve is short of, or redeem by taking out one it holds too much of. You swap 1:1 with no fee.</span></li>
        <li><span><b>you get paid.</b> The reward pool pays you in DFiUSD, in proportion to how much of the gap you close.</span></li>
      </ol>

      <dl className={s.bkStats}>
        <div><dt>basket</dt><dd>{balanced ? 'balanced' : 'off target'}</dd></div>
        <div><dt>reward pool</dt><dd>{f2(bounty)} DFiUSD</dd></div>
      </dl>
    </>
  );
}

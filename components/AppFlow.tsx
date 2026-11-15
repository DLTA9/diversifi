'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseAbiItem, zeroAddress, type Address, type Hash } from 'viem';
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi';
import { erc20Abi, reserveManagerAbi } from '@/lib/abi';
import { COINS, DEPLOY_TX, ETHERSCAN, FOOTNOTE, RM_ADDR, TOKEN_ADDR, txUrl } from '@/lib/coins';
import { burnPayout, maxMint, mintDeposits, parseAmount, toNum, type TargetParam } from '@/lib/flow';
import { f2, hhmm, type ReserveReading } from '@/lib/reserve';
import { CHAIN_NAMES, PREVIEW_ADDR, WALLETS } from '@/lib/wagmi';
import { Mark, MiniBar, TokenIcon, Wordmark } from './brand';
import { ReserveBar } from './ReserveBar';
import { useReserve } from './ReserveProvider';
import s from '@/app/app/app.module.css';

type Step = 'amount' | 'review' | 'done';
type Toast = { color: string; text: string; word: string } | null;
type Activity = { kind: 'MINT' | 'REDEEM'; amt: string; when: string; hash: string };
type Tab = 'swap' | 'contribute';
type Method = 'rebalance' | 'basket';

const short = (a?: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
// Balances are rounded down to the cent, so the shown balance is exactly what clicking it fills in.
const down2 = (n: number) => Math.floor(n * 100) / 100;
const E18 = 10n ** 18n;
const RM = { address: RM_ADDR, abi: reserveManagerAbi } as const;

// Swap (one coin in or out at market) isn't wired in-app yet; flip this when it ships.
const SWAP_LIVE = false;
// Coins with a DFiUSD pool on Uniswap V4 (frxUSD has none yet).
const POOLED = new Set(['USDC', 'DAI', 'USDS', 'USDT', 'GHO', 'FDUSD']);
// Uniswap's swap page with both tokens and the amount filled in. Used while swaps run outside the app.
const uniswapUrl = (from: string, to: string, value: string) =>
  `https://app.uniswap.org/swap?chain=mainnet&inputCurrency=${from}&outputCurrency=${to}${value ? `&value=${value}&field=input` : ''}`;

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
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: 1 });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>('amount');
  const [tab, setTab] = useState<Tab>(SWAP_LIVE ? 'swap' : 'contribute');
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
  const [done, setDone] = useState<{ at: number; hash: Hash; sumIn: string; sumOut: string; title: string } | null>(null);
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
    ],
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
  const [targets, compFeeQ, mintFeeQ, burnFeeQ, mintEnabledRead, bountyRaw] = params.data ?? [[] as readonly TargetParam[], 0n, 0n, 0n, undefined, 0n];
  const mintEnabled = mintEnabledRead ?? reading.mintEnabled;
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

  /* ---------- swap tab ---------- */
  const richest = COINS.reduce((best, _, i) => (usdBal(i) > usdBal(best) ? i : best), 0);
  const sIdx = swapIdx ?? richest;
  const sCoin = COINS[sIdx];
  const swapPayBal = side === 'buy' ? usdBal(sIdx) : dfiNum;
  const swapErr = tab === 'swap' && raw && ready && amt > swapPayBal ? 'amount is above your balance.' : '';
  const swapPooled = POOLED.has(sCoin.t);

  /* ---------- mint & redeem: rebalance with one coin ---------- */
  const gap = useMemo(() => gaps(reading), [reading]);
  // Coins the reserve accepts right now: short of target for a mint, over target for a redeem. Ignore dust under a cent.
  const open = COINS.map((_, i) => (dir === 'mint' ? gap[i].diff : -gap[i].diff) > 0.01);
  const anyOpen = open.some(Boolean);
  const firstOpen = open.findIndex(Boolean);
  const rIdx = rebIdx !== null && open[rebIdx] ? rebIdx : firstOpen >= 0 ? firstOpen : 0;
  const rCoin = COINS[rIdx];
  const rRoom = open[rIdx] ? down2(gap[rIdx].room) : 0;
  const totalImbalance = gap.reduce((a, g) => a + Math.abs(g.diff), 0);
  // Reward = pool × share of the imbalance this fixes (ReserveMath.calcEqualizationBounty), estimated in dollars.
  const reward = rebalancing() && amt > 0 && totalImbalance > 0 ? Math.min(bounty, bounty * Math.min(1, amt / totalImbalance)) : 0;
  function rebalancing() { return tab === 'contribute' && method === 'rebalance'; }
  const rebUnits = raw !== null ? raw / 10n ** BigInt(18 - rCoin.decimals) : 0n;
  let rebErr = '';
  if (rebalancing() && raw && ready) {
    if (amt > rRoom) rebErr = `the reserve takes up to ${f2(rRoom)} ${rCoin.t} right now.`;
    else if (dir === 'mint' && amt > usdBal(rIdx)) rebErr = 'amount is above your balance.';
    else if (dir === 'redeem' && amt - reward > dfiNum) rebErr = 'amount is above your DFiUSD balance.';
  }
  const rebValid = rebalancing() && anyOpen && !!raw && raw > 0n && !rebErr && ready && (dir === 'redeem' || mintEnabled);

  /* ---------- mint & redeem: the full basket (mint() / burn()) ---------- */
  const basket = tab === 'contribute' && method === 'basket';
  const isMint = basket && dir === 'mint';
  const deposits = useMemo(() => (raw && targets.length ? mintDeposits(raw, targets, compFeeQ) : []), [raw, targets, compFeeQ]);
  const shortfalls = deposits.filter((dp, i) => dp.amount > coinBals[i]);
  let error = '';
  if (raw !== null && raw === 0n) error = 'enter an amount above zero.';
  else if (basket && raw && ready && (isMint ? shortfalls.length > 0 : raw > dfiBal)) error = 'amount is above your balance.';
  const mintPaused = dir === 'mint' && !mintEnabled;
  const valid = basket && !!raw && raw > 0n && !error && ready && !(isMint && mintPaused);
  const depositTotal = deposits.reduce((a, dp) => a + toNum(dp.amount, dp.decimals), 0);
  const mintFeeAmt = isMint ? depositTotal - amt : 0;
  const redeem = burnPayout(amt, burnFee, reading.coins.map(c => c.current));
  const maxRaw = isMint ? maxMint(coinBals, targets, compFeeQ) : dfiBal;
  const approvalsNeeded = isMint ? deposits.filter((dp, i) => dp.amount > allowances[i]).length : 0;
  const feePct = (isMint ? mintFee : burnFee) * 100;
  const feeText = `${feePct.toFixed(2)}%` + (valid ? ' · ' + f2(isMint ? mintFeeAmt : amt * burnFee) + (isMint ? ' USD' : ' DFiUSD') : '');

  /* ---------- review summary, per route ---------- */
  const rebNeedsApproval = dir === 'mint' && rebUnits > allowances[rIdx];
  const summary = rebalancing()
    ? dir === 'mint'
      ? { title: 'review your rebalance.', kind: 'MINT' as const, in: `${f2(amt)} ${rCoin.t}`, out: `≈ ${f2(amt + reward)} DFiUSD`, extra: reward > 0 ? `≈ ${f2(reward)} DFiUSD reward` : 'none right now', requests: rebNeedsApproval ? `approve ${rCoin.t} + deposit` : 'deposit' }
      : { title: 'review your rebalance.', kind: 'REDEEM' as const, in: `≈ ${f2(Math.max(0, amt - reward))} DFiUSD`, out: `${f2(amt)} ${rCoin.t}`, extra: reward > 0 ? `≈ ${f2(reward)} DFiUSD less to burn` : 'none right now', requests: 'withdraw' }
    : isMint
      ? { title: 'review your mint.', kind: 'MINT' as const, in: `${valid ? f2(depositTotal) : '0.00'} across the basket`, out: `${f2(valid ? amt : 0)} DFiUSD`, extra: '', requests: approvalsNeeded ? `${approvalsNeeded} approval${approvalsNeeded > 1 ? 's' : ''} + mint` : 'mint' }
      : { title: 'review your redemption.', kind: 'REDEEM' as const, in: `${valid ? f2(amt) : '0.00'} DFiUSD`, out: `${f2(valid ? redeem.net : 0)} across the basket`, extra: '', requests: 'redeem' };

  /* ---------- activity: DFiUSD mint/burn transfers for this wallet ---------- */
  const loadHistory = useCallback(async () => {
    if (!client || !address) return;
    try {
      const rcpt = await client.getTransactionReceipt({ hash: DEPLOY_TX as Hash });
      const ev = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
      const [ins, outs] = await Promise.all([
        client.getLogs({ address: TOKEN_ADDR, event: ev, args: { from: zeroAddress, to: address }, fromBlock: rcpt.blockNumber }),
        client.getLogs({ address: TOKEN_ADDR, event: ev, args: { from: address, to: zeroAddress }, fromBlock: rcpt.blockNumber }),
      ]);
      const all = [...ins.map(l => ({ l, kind: 'MINT' as const })), ...outs.map(l => ({ l, kind: 'REDEEM' as const }))]
        .sort((a, b) => Number(b.l.blockNumber - a.l.blockNumber)).slice(0, 6);
      const rows = await Promise.all(all.map(async ({ l, kind }) => {
        const b = await client.getBlock({ blockNumber: l.blockNumber });
        const v = f2(toNum(l.args.value ?? 0n, 18));
        return {
          kind, hash: l.transactionHash,
          amt: kind === 'MINT' ? `→ ${v} DFiUSD` : `${v} DFiUSD →`,
          when: new Date(Number(b.timestamp) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        };
      }));
      setHistory(rows);
      setHistoryErr(false);
    } catch { setHistoryErr(true); /* public RPCs may cap log ranges */ }
  }, [client, address]);
  useEffect(() => { if (connected && !wrongNet) loadHistory(); else setHistory([]); }, [connected, wrongNet, loadHistory]);

  /* ---------- write flow ---------- */
  const canReview = rebValid || valid;
  const confirm = async () => {
    if (!canReview || !raw || !client) return;
    setPending(true); setRejected(false); setFailed('');
    const waitTx = async (hash: Hash) => { await client.waitForTransactionReceipt({ hash }); return hash; };
    // USDT reverts on changing a non-zero allowance; reset it first.
    const approve = async (i: number, units: bigint) => {
      const c = COINS[i];
      if (c.t === 'USDT' && allowances[i] > 0n) await waitTx(await writeContractAsync({ address: c.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, 0n], chainId: 1 }));
      await waitTx(await writeContractAsync({ address: c.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, units], chainId: 1 }));
    };
    try {
      let hash: Hash;
      if (rebalancing()) {
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
      const title = dir === 'mint' ? (rebalancing() ? 'rebalance confirmed.' : 'mint confirmed.') : (rebalancing() ? 'rebalance confirmed.' : 'redemption confirmed.');
      setDone({ at: Date.now(), hash, sumIn: summary.in, sumOut: summary.out, title });
      setHistory(h => [{ kind: summary.kind, hash, amt: dir === 'mint' ? `→ ${summary.out}` : `${summary.in} →`, when: 'just now' }, ...h]);
      setStep('done');
      showToast({ color: 'var(--ok)', text: title, word: 'CONFIRMED' }, 5000);
      reads.refetch();
    } catch (e) {
      if (isRejection(e)) {
        setRejected(true);
        showToast({ color: 'var(--crit)', text: 'request rejected in wallet.', word: 'REJECTED' }, 4000);
      } else {
        setFailed('the transaction didn’t go through. nothing was minted or redeemed.');
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

  const pick = (id: string) => {
    const c = connectors.find(k => k.id === id);
    if (c) connect({ connector: c, chainId: 1 });
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
        const val = isMint ? (dp && valid ? f2(toNum(dp.amount, dp.decimals)) : '0.00') : f2(valid ? redeem.parts[i] : 0);
        return (
          <div key={c.t} className={s.mixRow}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="sw" style={{ background: c.color }} />{c.t}
              <span style={{ fontSize: 12 }} className="dim">{isMint ? `balance ${ready ? f2(down2(usdBal(i))) : '—'}` : reading.coins[i].current.toFixed(1) + '%'}</span>
            </span>
            <span style={{ fontWeight: 600, color: low ? 'var(--crit)' : valid ? 'var(--fg)' : 'var(--dim)' }}>{val}</span>
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
              <Link href="/#reserve" className={s.navLink}>reserve</Link>
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

          {view === 'amount' && (
            <div className={s.col}>
              <div role="tablist" aria-label="mode" className={s.tabs}>
                <button type="button" role="tab" aria-selected={tab === 'swap'} className={tab === 'swap' ? s.tabOn : undefined} onClick={() => goTab('swap')}>
                  swap{!SWAP_LIVE && <span className={s.soonTag}>SOON</span>}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'contribute'} className={tab === 'contribute' ? s.tabOn : undefined} onClick={() => goTab('contribute')}>mint &amp; redeem</button>
              </div>

              {/* ---------- SWAP: one coin in or out at market, like a DEX ---------- */}
              {tab === 'swap' && (
                <>
                  <p className={s.lead}>Trade one coin for DFiUSD, or back, in one step. Swaps carry a higher fee: the system does the balancing for you.</p>
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
                        <span className={s.quoteAmt} style={{ color: amt > 0 ? 'var(--fg)' : 'var(--strong)' }}>{amt > 0 ? `≈ ${f2(amt)}` : '0.00'}</span>
                        {side === 'sell'
                          ? <CoinPick id="swapcoin" label="receive" value={String(sIdx)} onChange={v => setSwapIdx(Number(v))} options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color }))} />
                          : <DfiTag />}
                      </div>
                    </div>
                  </div>

                  <dl className={s.dl} style={{ fontSize: 14 }}>
                    <div><dt>rate</dt><dd className="mono">{side === 'buy' ? `1 ${sCoin.t} ≈ 1 DFiUSD` : `1 DFiUSD ≈ 1 ${sCoin.t}`}</dd></div>
                    <div><dt>swap fee</dt><dd>shown before you swap</dd></div>
                  </dl>

                  <button type="button" className={`btn btn-primary ${s.b52}`} disabled>{SWAP_LIVE ? 'swap' : 'swap · coming soon'}</button>
                  <div className={s.alts}>
                    {swapPooled
                      ? <a href={side === 'buy' ? uniswapUrl(sCoin.address, TOKEN_ADDR, amount) : uniswapUrl(TOKEN_ADDR, sCoin.address, amount)} target="_blank" rel="noopener">for now, swap on Uniswap&nbsp;↗</a>
                      : <span className="dim">{sCoin.t} has no DFiUSD pool yet.</span>}
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
                      <strong>the basket is balanced right now.</strong> Every coin is on target, so there is nothing to {dir === 'mint' ? 'add' : 'take out'} yet.{' '}
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
                                  options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color, disabled: !open[i], note: open[i] ? `up to ${f2(down2(gap[i].room))}` : 'on target' }))} />
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
                            <span className={s.quoteAmt} style={{ color: amt > 0 ? 'var(--fg)' : 'var(--strong)' }}>{amt > 0 ? `≈ ${f2(dir === 'mint' ? amt + reward : amt)}` : '0.00'}</span>
                            {dir === 'mint'
                              ? <DfiTag />
                              : <CoinPick id="rebcoin" label="coin to take out" value={String(rIdx)} onChange={v => { setRebIdx(Number(v)); clear(); }}
                                  options={COINS.map((c, i) => ({ value: String(i), label: c.t, color: c.color, disabled: !open[i], note: open[i] ? `up to ${f2(down2(gap[i].room))}` : 'on target' }))} />}
                          </div>
                        </div>
                      </div>

                      <dl className={s.dl} style={{ fontSize: 14 }}>
                        <div><dt>rate</dt><dd className="mono">1 {rCoin.t} = 1 DFiUSD · no fee</dd></div>
                        <div><dt>your reward</dt><dd className="mono" style={{ color: reward > 0 ? 'var(--ok)' : undefined }}>{reward > 0 ? (dir === 'mint' ? `+ ${f2(reward)} DFiUSD` : `${f2(reward)} DFiUSD less to give`) : bounty > 0 ? '—' : 'pool empty right now'}</dd></div>
                        <div><dt>reward pool</dt><dd className="mono">{f2(bounty)} DFiUSD</dd></div>
                      </dl>
                      <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!rebValid} onClick={() => rebValid && setStep('review')}>review {dir === 'mint' ? 'mint' : 'redeem'}</button>
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
                      <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!valid} onClick={() => valid && setStep('review')}>review {isMint ? 'mint' : 'redeem'}</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {view === 'review' && (
            <div className={s.col}>
              <div className="rail"><span>REVIEW · {dir === 'mint' ? 'MINT' : 'REDEEM'}{rebalancing() ? ' · REBALANCE' : ''}</span><span>STEP 2 OF 2</span></div>
              <p className="h3">{summary.title}</p>
              <dl className={s.dl}>
                <div><dt>{dir === 'mint' ? (rebalancing() ? 'you add' : 'you deposit') : 'you redeem'}</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.in}</dd></div>
                {rebalancing() && <div><dt>reward</dt><dd className="mono" style={{ color: reward > 0 ? 'var(--ok)' : undefined }}>{summary.extra}</dd></div>}
                {!rebalancing() && <div><dt>{isMint ? 'mint fee' : 'redeem fee'}</dt><dd className="mono">{feeText}</dd></div>}
                <div><dt>wallet requests</dt><dd className="mono">{summary.requests}</dd></div>
                <div><dt>you receive</dt><dd className="mono" style={{ fontWeight: 600 }}>{summary.out}</dd></div>
              </dl>
              {basket && !isMint && valid && (
                <div className={s.mix}>
                  {COINS.map((c, i) => (
                    <div key={c.t} className={s.mixRow}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><i className="sw" style={{ background: c.color }} />{c.t}</span>
                      <span style={{ fontWeight: 600 }}>{f2(redeem.parts[i])}</span>
                    </div>
                  ))}
                </div>
              )}
              {rejected && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>you rejected the request in your wallet. nothing was sent.</p>}
              {failed && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>{failed}</p>}
              <p className="foot">{rebalancing() ? 'The reward is an estimate: the contract pays it from the pool when your transaction lands.' : 'Fees are read from the contract and already included above.'} Your wallet will ask you to confirm.</p>
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
                <div><dt>{dir === 'mint' ? 'you added' : 'you redeemed'}</dt><dd className="mono">{done.sumIn}</dd></div>
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
              <ReserveBar size="md" readout showTotal={false} />
              <p className="dim pretty" style={{ fontSize: 14 }}>Whichever coin you swap with, the DFiUSD you get is backed by the whole basket.</p>
              <Link href="/#reserve" style={{ fontSize: 15 }}>check the reserve →</Link>
            </>
          )}
          {connected && !wrongNet && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <div className="rail"><span>ACTIVITY · THIS WALLET</span><span>{history.length} TX</span></div>
              {history.length === 0 && (
                <p className="foot" style={{ padding: '14px 0' }}>
                  {historyErr ? 'couldn’t load this wallet’s activity right now.' : 'no mints or redemptions yet.'}{' '}
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

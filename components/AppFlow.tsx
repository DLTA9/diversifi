'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseAbiItem, zeroAddress, type Address, type Hash } from 'viem';
import { useAccount, useConnect, useDisconnect, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi';
import { erc20Abi, reserveManagerAbi } from '@/lib/abi';
import { COINS, DEPLOY_TX, FOOTNOTE, RM_ADDR, rmUrl, TOKEN_ADDR, txUrl } from '@/lib/coins';
import { burnPayout, maxMint, mintDeposits, parseAmount, toNum, type TargetParam } from '@/lib/flow';
import { f2, hhmm } from '@/lib/reserve';
import { CHAIN_NAMES, WALLETS } from '@/lib/wagmi';
import { Mark, MiniBar, TokenIcon, Wordmark } from './brand';
import { ReserveBar } from './ReserveBar';
import { useReserve } from './ReserveProvider';
import s from '@/app/app/app.module.css';

type Step = 'amount' | 'review' | 'done';
type Toast = { color: string; text: string; word: string } | null;
type Activity = { kind: 'MINT' | 'REDEEM'; amt: string; when: string; hash: string };

const short = (a?: string) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const E18 = 10n ** 18n;
const RM = { address: RM_ADDR, abi: reserveManagerAbi } as const;

function isRejection(e: unknown) {
  for (let c = e as { name?: string; code?: number; cause?: unknown } | undefined; c; c = c.cause as typeof c) {
    if (c.name === 'UserRejectedRequestError' || c.code === 4001) return true;
  }
  return false;
}

export function AppFlow() {
  const { reading } = useReserve();
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: 1 });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>('amount');
  const [dir, setDir] = useState<'mint' | 'redeem'>('mint');
  const [amount, setAmount] = useState('');
  const [focus, setFocus] = useState(false);
  const [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [failed, setFailed] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [done, setDone] = useState<{ at: number; hash: Hash; sumIn: string; sumOut: string } | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
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
    query: { enabled, refetchInterval: 60_000 },
    contracts: [
      { ...RM, functionName: 'getTargetAssetParams', chainId: 1 },
      { ...RM, functionName: 'getCompoundingMintFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getMintFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getBurnFeeQ96', chainId: 1 },
      { ...RM, functionName: 'getIsMintEnabled', chainId: 1 },
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
  const [targets, compFeeQ, mintFeeQ, burnFeeQ, mintEnabledRead] = params.data ?? [[] as readonly TargetParam[], 0n, 0n, 0n, undefined];
  const mintEnabled = mintEnabledRead ?? reading.mintEnabled;
  const w = (wallet.data ?? []) as readonly bigint[];
  const dfiBal = w[0] ?? 0n;
  const coinBals = COINS.map((_, i) => w[1 + i] ?? 0n);
  const allowances = COINS.map((_, i) => w[8 + i] ?? 0n);
  const q96ToFrac = (q: bigint) => Number((q * E18) >> 96n) / 1e18;
  const mintFee = q96ToFrac(mintFeeQ);
  const burnFee = q96ToFrac(burnFeeQ);
  const ready = !!params.data && !!wallet.data;

  /* ---------- amount maths ---------- */
  const isMint = dir === 'mint';
  const raw = parseAmount(amount);
  const amt = raw !== null ? toNum(raw, 18) : 0;
  const deposits = useMemo(() => (raw && targets.length ? mintDeposits(raw, targets, compFeeQ) : []), [raw, targets, compFeeQ]);
  const shortfalls = deposits.filter((dp, i) => dp.amount > coinBals[i]);
  let error = '';
  if (raw !== null && raw === 0n) error = 'enter an amount above zero.';
  else if (raw && ready && (isMint ? shortfalls.length > 0 : raw > dfiBal)) error = 'amount is above your balance.';
  const mintPaused = isMint && !mintEnabled;
  const valid = !!raw && raw > 0n && !error && ready && !mintPaused;
  const depositTotal = deposits.reduce((a, dp) => a + toNum(dp.amount, dp.decimals), 0);
  const mintFeeAmt = isMint ? depositTotal - amt : 0;
  const redeem = burnPayout(amt, burnFee, reading.coins.map(c => c.current));
  const maxRaw = isMint ? maxMint(coinBals, targets, compFeeQ) : dfiBal;

  const feePct = (isMint ? mintFee : burnFee) * 100;
  const feeText = `${feePct.toFixed(2)}%` + (valid ? ' · ' + f2(isMint ? mintFeeAmt : amt * burnFee) + (isMint ? ' USD' : ' DFiUSD') : '');
  const sumIn = isMint ? (valid ? f2(depositTotal) : '0.00') + ' across all seven coins' : (valid ? f2(amt) : '0.00') + ' DFiUSD';
  const sumOut = isMint ? f2(valid ? amt : 0) + ' DFiUSD' : f2(valid ? redeem.net : 0) + ' across all seven coins';
  const approvalsNeeded = isMint ? deposits.filter((dp, i) => dp.amount > allowances[i]).length : 0;

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
          amt: kind === 'MINT' ? `all seven → ${v} DFiUSD` : `${v} DFiUSD → all seven`,
          when: new Date(Number(b.timestamp) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        };
      }));
      setHistory(rows);
    } catch { /* public RPCs may cap log ranges; activity stays as this session's txs */ }
  }, [client, address]);
  useEffect(() => { if (connected && !wrongNet) loadHistory(); else setHistory([]); }, [connected, wrongNet, loadHistory]);

  /* ---------- write flow ---------- */
  const confirm = async () => {
    if (!valid || !raw || !client) return;
    setPending(true); setRejected(false); setFailed('');
    const waitTx = async (hash: Hash) => { await client.waitForTransactionReceipt({ hash }); return hash; };
    try {
      let hash: Hash;
      if (isMint) {
        const need = deposits.map((dp, i) => ({ ...dp, i })).filter(dp => dp.amount > allowances[dp.i]);
        for (let k = 0; k < need.length; k++) {
          const dp = need[k];
          showToast({ color: 'var(--warn)', text: `approve ${dp.coin.t} in your wallet · ${k + 1} of ${need.length}`, word: 'WAITING' });
          // USDT reverts on changing a non-zero allowance; reset it first.
          if (dp.coin.t === 'USDT' && allowances[dp.i] > 0n) {
            await waitTx(await writeContractAsync({ address: dp.coin.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, 0n], chainId: 1 }));
          }
          await waitTx(await writeContractAsync({ address: dp.coin.address, abi: erc20Abi, functionName: 'approve', args: [RM_ADDR, dp.amount], chainId: 1 }));
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
      setDone({ at: Date.now(), hash, sumIn, sumOut });
      setHistory(h => [{ kind: isMint ? 'MINT' : 'REDEEM', hash, amt: isMint ? `all seven → ${f2(amt)} DFiUSD` : `${f2(amt)} DFiUSD → all seven`, when: 'just now' }, ...h]);
      setStep('done');
      showToast({ color: 'var(--ok)', text: isMint ? 'mint confirmed.' : 'redemption confirmed.', word: 'CONFIRMED' }, 5000);
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
  const setMax = () => { const n = toNum(maxRaw, 18); setAmount((Math.floor(n * 100) / 100).toFixed(2)); };
  const setDirection = (v: 'mint' | 'redeem') => { setDir(v); setAmount(''); setFailed(''); };
  const reset = () => { setStep('amount'); setAmount(''); setToast(null); setRejected(false); setDone(null); };

  const walletLabel = connected ? short(address) : 'connect wallet';
  const pick = (id: string) => {
    const c = connectors.find(k => k.id === id);
    if (c) connect({ connector: c, chainId: 1 });
  };

  return (
    <div className={s.page}>
      <nav aria-label="app" className={s.nav}>
        <div className={`wrap ${s.navIn}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <Link href="/" aria-label="DiversiFi home" className={s.logo}><Wordmark /></Link>
            <div className={s.navLinks}>
              <span aria-current="page" className={s.current}>mint &amp; redeem</span>
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
        <h1 className="sr-only">mint and redeem DFiUSD</h1>
        <section aria-label="mint and redeem" className={s.flow}>
          {view === 'connect' && (
            <div className={s.connect}>
              <Mark size={72} />
              <p className="h3" style={{ maxWidth: '18em' }}>connect a wallet to mint or redeem DFiUSD.</p>
              <div id="wallets" className={s.wallets}>
                {WALLETS.map(w => (
                  <button key={w.id} type="button" className={s.walletRow} onClick={() => pick(w.id)} disabled={connecting || !w.ready}>
                    <span>{w.name}</span><span className={s.kind}>{w.ready ? w.kind : 'NOT SET UP'}</span>
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
              <p className="dim pretty">DFiUSD and the reserve contract are on Ethereum mainnet. Switch networks in your wallet to mint or redeem.</p>
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
              <div role="tablist" aria-label="action" className={s.tabs}>
                <button type="button" role="tab" aria-selected={isMint} className={isMint ? s.tabOn : undefined} onClick={() => setDirection('mint')}>mint</button>
                <button type="button" role="tab" aria-selected={!isMint} className={!isMint ? s.tabOn : undefined} onClick={() => setDirection('redeem')}>redeem</button>
              </div>

              {mintPaused && <p role="status" className="small" style={{ color: 'var(--warn)' }}>minting is paused. redemptions are still open.</p>}

              <div className={s.field}>
                <label htmlFor="amount" className={s.flabel}>{isMint ? 'you mint' : 'you redeem'}</label>
                <div className={s.input} style={{ borderColor: error ? 'var(--crit)' : focus ? 'var(--fg)' : 'var(--strong)', boxShadow: focus ? '0 0 0 3px var(--bg), 0 0 0 5px var(--signal)' : 'none' }}>
                  <input id="amount" value={amount} onChange={onAmount} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                    inputMode="decimal" autoComplete="off" placeholder="0.00" aria-invalid={!!error} aria-describedby={error ? 'amount-err' : undefined} />
                  <span className={s.unit}><TokenIcon size={18} />DFiUSD</span>
                </div>
                <div className={s.balRow}>
                  <span>{isMint ? `you can mint up to ${ready ? f2(toNum(maxRaw, 18)) : '—'}` : `balance ${ready ? f2(toNum(dfiBal, 18)) : '—'} DFiUSD`}</span>
                  <button type="button" className={s.max} onClick={setMax} disabled={!ready}>max</button>
                </div>
                {error && <p id="amount-err" role="alert" style={{ fontSize: 13, color: 'var(--crit)' }}>{error}</p>}
              </div>

              <div className={s.field}>
                <span className={s.flabel}>{isMint ? 'you deposit' : 'you receive'}</span>
                <div className={s.mix}>
                  {COINS.map((c, i) => {
                    const dp = deposits[i];
                    const low = isMint && dp && dp.amount > coinBals[i] && ready;
                    const val = isMint ? (dp && valid ? f2(toNum(dp.amount, dp.decimals)) : '0.00') : f2(valid ? redeem.parts[i] : 0);
                    return (
                      <div key={c.t} className={s.mixRow}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className="sw" style={{ background: c.color }} />{c.t}
                          <span style={{ fontSize: 12 }} className="dim">{isMint ? `balance ${ready ? f2(toNum(coinBals[i], c.decimals)) : '—'}` : reading.coins[i].current.toFixed(1) + '%'}</span>
                        </span>
                        <span style={{ fontWeight: 600, color: low ? 'var(--crit)' : valid ? 'var(--fg)' : 'var(--dim)' }}>{val}</span>
                      </div>
                    );
                  })}
                  {/* TODO(open item 1): copy for the basket mint needs sign-off; home page still describes single-coin deposits. */}
                  <p className="foot" style={{ padding: '10px 0 8px' }}>{isMint ? 'Mints take all seven coins at the target split.' : 'Redemptions pay the current mix of all seven coins.'}</p>
                </div>
              </div>

              <dl className={s.dl} style={{ fontSize: 14 }}>
                <div><dt>{isMint ? 'mint fee' : 'redeem fee'}</dt><dd className="mono">{feeText}</dd></div>
                {isMint && <div><dt>approvals</dt><dd className="mono">{valid ? (approvalsNeeded ? `${approvalsNeeded} of 7 coins` : 'none needed') : '—'}</dd></div>}
                <div><dt>backing</dt><dd style={{ display: 'flex', alignItems: 'center', gap: 12 }}><MiniBar width={84} height={8} gap={1} radius={1} />all seven coins</dd></div>
                <div><dt>network</dt><dd>Ethereum mainnet</dd></div>
              </dl>

              <button type="button" className={`btn btn-primary ${s.b52}`} disabled={!valid} onClick={() => valid && setStep('review')}>review</button>
            </div>
          )}

          {view === 'review' && (
            <div className={s.col}>
              <div className="rail"><span>{isMint ? 'REVIEW · MINT' : 'REVIEW · REDEEM'}</span><span>STEP 2 OF 2</span></div>
              <p className="h3">{isMint ? 'review your mint.' : 'review your redemption.'}</p>
              <dl className={s.dl}>
                <div><dt>{isMint ? 'you deposit' : 'you redeem'}</dt><dd className="mono" style={{ fontWeight: 600 }}>{sumIn}</dd></div>
                <div><dt>{isMint ? 'mint fee' : 'redeem fee'}</dt><dd className="mono">{feeText}</dd></div>
                {isMint && <div><dt>wallet requests</dt><dd className="mono">{approvalsNeeded ? `${approvalsNeeded} approval${approvalsNeeded > 1 ? 's' : ''} + mint` : 'mint'}</dd></div>}
                <div><dt>you receive</dt><dd className="mono" style={{ fontWeight: 600, textAlign: 'right' }}>{sumOut}</dd></div>
                <div><dt>backing</dt><dd>all seven coins</dd></div>
                <div><dt>network</dt><dd>Ethereum mainnet</dd></div>
              </dl>
              {rejected && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>you rejected the request in your wallet. nothing was sent.</p>}
              {failed && <p role="alert" className="small" style={{ color: 'var(--crit)' }}>{failed}</p>}
              <p className="foot">Mint and redeem fees apply. The amount you receive is shown after fees. Your wallet will ask you to confirm.</p>
              <div className={s.btnRow}>
                <button type="button" className={`btn btn-secondary ${s.b52}`} style={{ flex: 1 }} disabled={pending} onClick={() => { setStep('amount'); setRejected(false); setFailed(''); }}>back</button>
                <button type="button" className={`btn btn-primary ${s.b52}`} style={{ flex: 2 }} disabled={pending} onClick={confirm}>
                  {pending ? 'waiting for wallet…' : rejected || failed ? 'try again' : 'confirm in wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'done' && done && (
            <div className={s.col} style={{ flex: 1 }}>
              <div className="rail"><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)' }}><i className="dot" style={{ background: 'var(--ok)' }} />CONFIRMED</span><span>{hhmm(done.at)} UTC</span></div>
              <p style={{ fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.03em' }}>{isMint ? 'mint confirmed.' : 'redemption confirmed.'}</p>
              <dl className={s.dl}>
                <div><dt>{isMint ? 'you deposited' : 'you redeemed'}</dt><dd className="mono">{done.sumIn}</dd></div>
                <div><dt>you received</dt><dd className="mono" style={{ fontWeight: 600, textAlign: 'right' }}>{done.sumOut}</dd></div>
                <div><dt>transaction</dt><dd><a href={txUrl(done.hash)} target="_blank" rel="noopener" className="mono" style={{ fontSize: 14 }}>{short(done.hash)} · etherscan →</a></dd></div>
              </dl>
              <div className={s.btnRow}>
                <Link href="/#reserve" className={`btn btn-secondary ${s.b52}`} style={{ flex: 1 }}>check the reserve</Link>
                <button type="button" className={`btn btn-primary ${s.b52}`} style={{ flex: 1 }} onClick={reset}>done</button>
              </div>
            </div>
          )}
        </section>

        <aside aria-label="backing" className={s.aside}>
          <div className="rail"><span>BACKING</span><span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}><span className="livedot" />LIVE · {hhmm(reading.readAt)} UTC</span></div>
          <p style={{ fontSize: 'clamp(20px, 2vw, 24px)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>every DFiUSD is backed by all seven.</p>
          <ReserveBar size="md" readout showTotal={false} />
          <p className="dim pretty" style={{ fontSize: 14 }}>Mints deposit at the target split. Redemptions pay the current mix of all seven coins.</p>
          <Link href="/#reserve" style={{ fontSize: 15 }}>check the reserve →</Link>
          {connected && !wrongNet && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
              <div className="rail"><span>ACTIVITY · THIS WALLET</span><span>{history.length} TX</span></div>
              {history.length === 0 && <p className="foot" style={{ padding: '14px 0' }}>no mints or redemptions yet. <a href={`${rmUrl}`} target="_blank" rel="noopener">view on etherscan →</a></p>}
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

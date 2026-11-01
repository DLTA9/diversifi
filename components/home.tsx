'use client';

import { useEffect, useRef, useState } from 'react';
import { COINS, coinUrl, FOOTNOTE, rmUrl } from '@/lib/coins';
import { fmtBlock, fmtK, hhmm } from '@/lib/reserve';
import { ReserveBar } from './ReserveBar';
import { useReserve } from './ReserveProvider';
import { ARCS, TokenIcon } from './brand';
import s from '@/app/home.module.css';

const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- status rail text for the hero panel ---------- */
function useRail() {
  const { reading, mode, ageMin } = useReserve();
  const t = hhmm(reading.readAt);
  return {
    live: { text: `LIVE · ${t} UTC`, color: 'var(--fg)' },
    loading: { text: 'LOADING', color: 'var(--dim)' },
    stale: { text: `AS OF ${t} UTC · ${ageMin} MIN OLD`, color: 'var(--warn)' },
    unavailable: { text: 'UNAVAILABLE', color: 'var(--dim)' },
  }[mode];
}

/* ---------- 1d: market vs DFiUSD morph ---------- */
const MARKET = [61, 9, 8, 7, 6, 5, 4];

export function MarketMorph() {
  const [m, setM] = useState(0);
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    if (picked) return;
    if (reduced()) { setM(1); return; }
    let iv = 0;
    const first = window.setTimeout(() => {
      setM(1);
      iv = window.setInterval(() => setM(v => (v ? 0 : 1)), 4200);
    }, 2600);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [picked]);

  const pick = (v: number) => { setPicked(true); setM(v); };

  return (
    <div className={s.morph}>
      <div role="img" aria-label="Comparison. Stablecoin market: one issuer holds 61% of supply, 151 issuers share the other 39%. DFiUSD reserve: seven coins, largest share 30%." className={s.morphFig}>
        <div className={s.morphHead}>
          <span style={{ color: 'var(--fg)' }}>{m ? 'DFIUSD' : 'THE MARKET'}</span>
          <span style={{ color: m ? 'var(--dim)' : 'var(--warn)', transition: 'color 400ms' }}>{m ? '7 COINS · LARGEST SHARE 30%' : '1 ISSUER · 61% · 151 OTHERS · 39%'}</span>
        </div>
        <div className={s.morphBar}>
          {COINS.map((c, i) => (
            <i key={c.t} style={{ flex: `${m ? c.s : MARKET[i]} 1 0px`, background: m ? c.color : i === 0 ? 'var(--warn)' : 'var(--strong)' }}>
              <b style={{ opacity: !m && i === 0 ? 1 : 0 }} />
            </i>
          ))}
        </div>
      </div>
      <div role="group" aria-label="compare" className={s.toggle}>
        <button type="button" aria-pressed={!m} onClick={() => pick(0)} className={!m ? s.on : undefined}>market</button>
        <button type="button" aria-pressed={!!m} onClick={() => pick(1)} className={m ? s.on : undefined}>dfiusd</button>
      </div>
    </div>
  );
}

/* ---------- 1a/1e: live reserve panel ---------- */
function RollingBlock({ n }: { n: number }) {
  return (
    <span className={s.roll} aria-label={fmtBlock(n)}>
      {fmtBlock(n).split('').map((ch, i) =>
        /\d/.test(ch)
          ? <span key={i} className={s.digit} aria-hidden="true"><span style={{ transform: `translateY(-${ch}em)` }}>{'0123456789'.split('').map(d => <span key={d}>{d}</span>)}</span></span>
          : <span key={i} aria-hidden="true">{ch}</span>
      )}
    </span>
  );
}

export function ReservePanel() {
  const { reading, mode, refresh } = useReserve();
  const rail = useRail();
  // intro: 0 = ring hidden, 1 = arcs drawing, 2 = ring out / bar in. Once per visit.
  const [intro, setIntro] = useState(0);
  const [block, setBlock] = useState(reading.block);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    if (reduced() || sessionStorageGet('dfi-intro')) { setIntro(2); return; }
    sessionStorageSet('dfi-intro');
    const a = window.setTimeout(() => setIntro(1), 120);
    const b = window.setTimeout(() => setIntro(2), 1250);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  // Block heartbeat: progress line fills over 12s, block number rolls each slot, re-synced on every read.
  useEffect(() => { setBlock(reading.block); setAgo(Math.floor((Date.now() - reading.readAt) / 1000) % 12); }, [reading.block, reading.readAt]);
  useEffect(() => {
    if (mode !== 'live' || reduced()) return;
    const iv = window.setInterval(() => setAgo(a => {
      if (a + 1 >= 12) { setBlock(b => b + 1); return 0; }
      return a + 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [mode]);

  const live = mode === 'live';
  const lastAt = hhmm(reading.readAt);

  return (
    <section aria-label="live reserve" className={s.panel}>
      <div className={`rail ${s.panelRail}`}>
        <span>RESERVE · ETHEREUM</span>
        <i aria-hidden="true" className={s.hb} style={{ width: `${(ago / 12) * 100}%`, opacity: live ? 1 : 0, transition: ago === 0 ? 'none' : 'width 1s linear' }} />
        <span role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: rail.color }}>
          {live && <span className="livedot" />}{rail.text}
        </span>
      </div>
      <p className="h3">7 stablecoins, no single issuer.</p>
      {mode === 'unavailable' && <p className="small">reserve data couldn&apos;t load. <span className="dim">last reading {lastAt} UTC.</span></p>}
      <div style={{ position: 'relative' }}>
        <div style={{ opacity: intro >= 2 ? 1 : 0, transition: 'opacity 300ms' }}>
          <ReserveBar size="md" readout showTotal={false} start={intro >= 2} />
        </div>
        <div aria-hidden="true" className={s.ring} style={{ opacity: intro >= 2 ? 0 : 1, transform: intro >= 2 ? 'scale(.55) rotate(120deg)' : 'none' }}>
          <svg viewBox="0 0 100 100" width={120} height={120}>
            <g fill="none" transform="rotate(-90 50 50)" strokeWidth={10}>
              {ARCS.map((a, i) => (
                <circle key={i} cx={50} cy={50} r={40} stroke={COINS[i].color} strokeDashoffset={a.o}
                  style={{ strokeDasharray: intro >= 1 ? a.d : '0 251.33', transition: `stroke-dasharray 520ms var(--ease) ${i * 90}ms` }} />
              ))}
            </g>
            <circle cx={50} cy={50} r={8} fill="var(--signal)" />
          </svg>
        </div>
      </div>
      <div className={s.panelFoot}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'stale' && <button type="button" className="mini-btn" onClick={refresh}>refresh</button>}
          {mode === 'loading' && <span className="skel">block 00,000,000</span>}
          {mode === 'unavailable' && <span>last reading {lastAt} UTC</span>}
          {(live || mode === 'stale') && <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>block {live ? <RollingBlock n={block} /> : <span style={{ color: 'var(--fg)' }}>{fmtBlock(reading.block)}</span>}</span>}
        </span>
        <a href={rmUrl} target="_blank" rel="noopener" className={s.footLink}>
          {mode === 'unavailable' ? 'check it directly on etherscan →' : 'view the contract on Etherscan →'}
        </a>
      </div>
    </section>
  );
}

function sessionStorageGet(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k: string) { try { sessionStorage.setItem(k, '1'); } catch { /* private mode */ } }

/* ---------- 03 mint diagram: cycles the seven coins ---------- */
function useMintCycle() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const iv = window.setInterval(() => setIdx(i => (i + 1) % 7), 1800);
    return () => clearInterval(iv);
  }, []);
  const c = COINS[idx];
  return { idx, coin: c };
}

export function MintDots() {
  const { idx, coin } = useMintCycle();
  return (
    <>
      <div className={s.diaHead}>
        <span className="label-sm">DEPOSIT ANY OF THE SEVEN</span>
        <span style={{ display: 'flex', gap: 3 }}>{COINS.map((k, i) => <i key={k.t} className={s.mintDot} style={{ background: k.color, opacity: i === idx ? 1 : 0.28 }} />)}</span>
      </div>
      <div className={s.diaRow}>
        <span className="chip" style={{ minWidth: 96 }}><i className="sw" style={{ background: coin.color, transition: 'background-color 400ms' }} />{coin.t}</span>
        <span className="mono dim">→</span>
        <DfiChipInline />
      </div>
    </>
  );
}
function DfiChipInline() {
  return (
    <span className="chip" style={{ fontWeight: 600 }}>
      <svg viewBox="0 0 100 100" width={16} height={16} aria-hidden="true"><circle cx={50} cy={50} r={50} fill="#BFEFFF" /><circle cx={50} cy={50} r={30} fill="none" stroke="#0D0E10" strokeWidth={12} /><circle cx={50} cy={50} r={9} fill="#0D0E10" /></svg>DFiUSD
    </span>
  );
}

/* ---------- 04 the reserve ---------- */
export function ReserveSection() {
  const { reading, mode, refresh, ageMin } = useReserve();
  const t = hhmm(reading.readAt);
  const blk = fmtBlock(reading.block);
  const rail = {
    live: `ETHEREUM · ${t} UTC · BLOCK ${blk}`,
    loading: 'ETHEREUM · LOADING',
    stale: `ETHEREUM · AS OF ${t} UTC · BLOCK ${blk}`,
    unavailable: `ETHEREUM · LAST READING ${t} UTC`,
  }[mode];
  const max = Math.max(...reading.coins.map(c => c.current));
  const rows = COINS.map((c, i) => ({ ...c, d: reading.coins[i], url: coinUrl(c), aria: `${c.t} held by the reserve, on Etherscan` }));

  return (
    <section id="reserve" className={`wrap ${s.section}`}>
      <div className="rail"><span>04 · THE RESERVE</span><span>{rail}</span></div>
      <h2 className="h2" style={{ marginTop: 40 }}>the reserve, coin by coin.</h2>
      {mode === 'unavailable' && (
        <p style={{ marginTop: 24 }}>reserve data couldn&apos;t load. <span className="dim">last reading {t} UTC.</span> <a href={rmUrl} target="_blank" rel="noopener">check it directly on etherscan →</a></p>
      )}
      {mode === 'stale' && (
        <p className="mono" style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--warn)' }}>
          THIS READING IS {ageMin} MIN OLD <button type="button" className="mini-btn" onClick={refresh}>refresh</button>
        </p>
      )}

      <div className={s.tableWide}>
        <div role="table" aria-label="reserve composition" className={s.table}>
          <div role="row" className={`${s.tr} ${s.th}`}>
            <span role="columnheader">COIN</span><span role="columnheader">ISSUER</span>
            <span role="columnheader" className={s.r}>HELD</span><span role="columnheader" className={s.r}>SHARE</span>
            <span role="columnheader" className={s.r}>SOURCE</span>
          </div>
          {rows.map(c => (
            <div role="row" key={c.t} className={s.tr}>
              <span role="cell" className={s.coinCell}><i className="sw" style={{ background: c.color }} />{c.t}</span>
              <span role="cell" className={s.issuer}>{c.issuer}</span>
              <a role="cell" href={c.url} target="_blank" rel="noopener" className={`${s.r} ${s.cellLink}`} style={{ fontWeight: 600 }} tabIndex={-1}>{fmtK(c.d.held)}</a>
              <a role="cell" href={c.url} target="_blank" rel="noopener" className={`${s.r} ${s.cellLink}`} style={{ color: 'var(--dim)' }} tabIndex={-1}>{c.d.current.toFixed(1)}%</a>
              <a role="cell" href={c.url} target="_blank" rel="noopener" aria-label={c.aria} className={`${s.r} ${s.src}`}>balance →</a>
            </div>
          ))}
          <div role="row" className={`${s.tr} ${s.total}`}>
            <span role="cell" className="label">TOTAL</span>
            <span role="cell" className={s.issuer} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}><TokenIcon size={16} />DiversiFi</span>
            <a role="cell" href={rmUrl} target="_blank" rel="noopener" className={`${s.r} ${s.cellLink}`} style={{ fontWeight: 600 }} tabIndex={-1}>{fmtK(reading.total)}</a>
            <span role="cell" className={s.r} style={{ color: 'var(--dim)' }}>100.0%</span>
            <a role="cell" href={rmUrl} target="_blank" rel="noopener" aria-label="ReserveManagerV1 on Etherscan" className={`${s.r} ${s.src}`}>ReserveManagerV1 →</a>
          </div>
        </div>
      </div>

      <div role="list" aria-label="reserve composition" className={`mono ${s.tableNarrow}`}>
        {rows.map(c => (
          <div role="listitem" key={c.t} className={s.nRow}>
            <div className={s.nTop}>
              <span className={s.nCoin}><i className="sw" style={{ background: c.color }} />{c.t}<span className={s.nIssuer}>{c.issuer}</span></span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{fmtK(c.d.held)}</span>
            </div>
            <span aria-hidden="true" className={s.nBar}><i style={{ width: `${(c.d.current / max) * 100}%`, background: c.color }} /></span>
            <div className={s.nFoot}><a href={c.url} target="_blank" rel="noopener" aria-label={c.aria}>balance →</a></div>
          </div>
        ))}
        <div className={s.nTotal}><span className="label">TOTAL</span><span style={{ fontWeight: 600 }}>{fmtK(reading.total)}</span></div>
      </div>

      <p className="foot" style={{ marginTop: 24, maxWidth: '60em' }}>Shares are rounded to one decimal by largest remainder, so they total 100. {FOOTNOTE}</p>
    </section>
  );
}

/* ---------- 05 issuer-fails explainer: animation is the main element ---------- */
const FAIL_STEPS = [
  { title: 'the loss stays in its slice.', body: 'A failing coin affects only its share of the backing. The other six coins sit in the reserve as before.', short: 'The loss stays in its slice. The other six are untouched.' },
  { title: 'its target is set to 0%.', body: "The failing coin's target share can be set to 0%. The other six targets take up its share.", short: 'Its target is set to 0%. The other six take up its share.' },
  { title: 'swaps only run toward target.', body: 'Each swap moves the reserve closer to the new target, so the failing coin is pushed out over time.', short: 'Swaps only run toward target, pushing the coin out.' },
  { title: 'minting can be paused.', body: 'New mints can be stopped while the failing coin is still in the reserve.', short: 'New mints can pause while the coin is still held.' },
];
const STEP_MS = 3200;

export function IssuerExplainer() {
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // Autoplay 01→04 and loop while in view; a click jumps to that step and the loop carries on from there.
  // Reduced motion: end state, no loop.
  useEffect(() => {
    if (reduced()) { setStep(3); return; }
    let iv = 0;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(iv);
      if (e.isIntersecting) iv = window.setInterval(() => setStep(st => (st + 1) % 4), STEP_MS);
    }, { threshold: 0.4 });
    io.observe(root.current!);
    return () => { io.disconnect(); clearInterval(iv); };
  }, [run]);

  const pick = (i: number) => { setStep(i); setRun(r => r + 1); };

  return (
    <div ref={root} className={s.ex}>
      <div className={s.exRail}><span style={{ color: 'var(--crit)' }}>ONE ISSUER FAILS</span><span className="dim">NONE AUTOMATIC</span></div>

      <div role="tablist" aria-label="failure steps" className={s.exTabs}>
        {FAIL_STEPS.map((st, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === step} aria-controls="ex-caption" onClick={() => pick(i)}
            className={i < step ? s.exDone : i === step ? s.exOn : undefined}>
            <span className={s.exLine} aria-hidden="true">
              {i === step && <i key={`${step}-${run}`} className={s.exProg} style={{ animationDuration: `${STEP_MS}ms` }} />}
            </span>
            <span className={s.exNum}>0{i + 1}</span>
            <span className={s.exTab}>{st.title}</span>
          </button>
        ))}
      </div>

      <div className={s.exFig}>
        <div aria-hidden="true" className={s.ifGrid}>
          <span>NOW</span>
          <div className={s.ifBar} style={{ height: 40, opacity: step >= 3 ? 0.6 : 1, transition: 'opacity 900ms' }}>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ flex: step >= 2 ? (i === 3 ? '0.2 1 0px' : '1.13 1 0px') : '1 1 0px', background: i === 3 ? 'var(--crit)' : 'var(--strong)', transition: 'flex-grow 1600ms cubic-bezier(.45,0,.2,1)' }} />
            ))}
          </div>
          <span style={{ opacity: step >= 1 ? 1 : 0.15, transition: 'opacity 900ms' }}>TARGET</span>
          <div className={s.ifBar} style={{ height: 16, opacity: step >= 1 ? 1 : 0.15, transition: 'opacity 900ms' }}>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ flex: step >= 1 && i === 3 ? '0 1 0px' : '1 1 0px', background: 'var(--strong)', transition: 'flex-grow 1300ms cubic-bezier(.45,0,.2,1)' }} />
            ))}
          </div>
        </div>
        <div className={s.exSayRow}>
          <p id="ex-caption" role="tabpanel" aria-live="polite" key={step} className={s.exSay}>{FAIL_STEPS[step].short}</p>
          <span aria-hidden="true" className="chip chip-sm" style={{ flexShrink: 0, opacity: step >= 3 ? 1 : 0, transform: step >= 3 ? 'scale(1)' : 'scale(1.35)', transition: 'opacity 500ms, transform 700ms cubic-bezier(.2,1.4,.4,1)' }}>
            <i className={s.pauseSq} />MINT · PAUSED
          </span>
        </div>
      </div>

      {/* All four steps in the HTML for crawlers and screen readers; the caption above shows one at a time. */}
      <ol className="sr-only">{FAIL_STEPS.map((st, i) => <li key={i}>{st.title} {st.body}</li>)}</ol>
    </div>
  );
}

/* ---------- 07 signup ---------- */
const okEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function Signup() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'open' | 'error' | 'done' | 'sending'>('open');
  const err = state === 'error';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!okEmail(email)) { setState('error'); return; }
    setState('sending');
    try {
      const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      setState(r.ok ? 'done' : 'error');
    } catch { setState('error'); }
  };

  return (
    <form onSubmit={submit} noValidate className={s.signup}>
      <label htmlFor="signup" className="label">NOT READY TO MINT? GET THE MONTHLY RESERVE READING.</label>
      {state !== 'done' ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input id="signup" type="email" value={email} placeholder="you@example.com" autoComplete="email" aria-invalid={err} aria-describedby={err ? 'signup-err' : undefined}
              onChange={e => { setEmail(e.target.value); if (err) setState('open'); }}
              className={s.email} style={{ borderColor: err ? 'var(--crit)' : 'var(--strong)' }} />
            <button type="submit" className={`btn btn-secondary ${s.subBtn}`} disabled={state === 'sending'}>subscribe</button>
          </div>
          {err && <p id="signup-err" role="alert" style={{ fontSize: 14, color: 'var(--crit)' }}>enter a valid email address.</p>}
          <p style={{ fontSize: 14 }} className="dim">One email a month: the split, the total and the block it was read at.</p>
        </>
      ) : (
        <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, fontSize: 17 }}><i className="dot" style={{ background: 'var(--ok)' }} />you&apos;re on the list for the monthly reserve reading.</p>
      )}
    </form>
  );
}

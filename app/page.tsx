import Link from 'next/link';
import { Crops, DfiChip, Mark, MiniBar, Ruler, Wordmark } from '@/components/brand';
import { IssuerVisual, MarketMorph, MintDots, ReservePanel, ReserveSection, Signup } from '@/components/home';
import { ReserveProvider } from '@/components/ReserveProvider';
import { CONTACT_MAIL, DEPLOY_TX, DOCS_URL, ETHERSCAN, FOOTNOTE, rmUrl, TERMS_URL, tokenUrl, WHITEPAPER_URL, X_URL } from '@/lib/coins';
import { FALLBACK_READING, readReserve } from '@/lib/reserve';
import s from './home.module.css';

// Static pre-render, re-read from chain at most once a minute (ISR) so crawlers see current figures.
export const revalidate = 60;

// TODO(open item 4): CertiK date, findings and report link. Flip once the report is public.
const CERTIK_PUBLIC = true;

export default async function Home() {
  let initial = FALLBACK_READING;
  let ok = true;
  try { initial = await readReserve(); } catch { ok = false; }

  return (
    <ReserveProvider initial={initial} initialOk={ok}>
      <nav aria-label="primary" className={s.nav}>
        <div className={`wrap ${s.navIn}`}>
          <a href="#top" aria-label="DiversiFi home" className={s.logo}><Wordmark /></a>
          <Link href="/app" className="btn btn-primary btn-nav">open app</Link>
        </div>
      </nav>

      <main>
        {/* 01 HERO */}
        <header id="top" className={`gridbg ${s.hero}`}>
          <Crops />
          <div className={`wrap ${s.heroIn}`}>
            <div className={s.heroL}>
              {/* TODO(open item 3): compliance review of eyebrow, "1:1" and "so no single issuer can sink it". */}
              <p className="label">THE PREFERRED RESERVE ASSET</p>
              <h1 className="h1">structured stability.</h1>
              <p className="dim pretty" style={{ maxWidth: '34em' }}>Every DFiUSD is backed 1:1 by a basket of seven USD stablecoins, so no single issuer can sink it.</p>
              <div className={s.ctaRow}>
                <Link href="/app" className="btn btn-primary">open app</Link>
                <a href="#reserve" className="btn btn-secondary">check reserves</a>
              </div>
              <div className={s.conc}>
                <div className={s.concStat}>
                  <span className={s.big}>61%</span>
                  <p className="pretty" style={{ fontSize: 16, lineHeight: 1.4 }}>of all stablecoin supply still sits with one issuer. DFiUSD spreads its backing across seven.</p>
                </div>
                <MarketMorph />
                {/* TODO(open item 4): source name. */}
                <span className={s.source}>Q3 2026 · 195 STABLECOINS · 152 ISSUERS · SOURCE: [NAME]</span>
              </div>
            </div>
            <ReservePanel />
          </div>
        </header>

        {/* 02 PROOF */}
        <section aria-label="proof" className={s.proof}>
          <div className={`wrap ${s.proofGrid}`}>
            <a href="#docs" className={s.proofCell}><span className="label">AUDITED BY</span><span>{CERTIK_PUBLIC ? 'NETHERMIND · CERTIK' : 'NETHERMIND · 20 AUG 2025'}</span></a>
            <a href={rmUrl} target="_blank" rel="noopener" className={s.proofCell}><span className="label">LIVE SINCE</span><span>SEP 2025</span></a>
            <a href="#reserve" className={s.proofCell}><span className="label">RESERVES</span><span>ON-CHAIN, VIEWABLE ANY TIME</span></a>
          </div>
          <div className="wrap" style={{ paddingBottom: 24 }}><p className="foot" style={{ maxWidth: '72em' }}>{FOOTNOTE}</p></div>
        </section>

        {/* 03 HOW IT WORKS: no headline, intentionally */}
        <section id="how" aria-label="how it works" className={`wrap ${s.how}`}>
          <div className={s.cards}>
            <article className={s.card}>
              <div className={s.cardHead}><span className={s.num}>01</span><h3 className="h3">mint</h3></div>
              <div aria-hidden="true" className={s.dia}><MintDots /></div>
              {/* TODO(open item 1): copy assumes single-coin mint; the contract's mint takes all seven. */}
              <p className="dim pretty">Deposit a basket stablecoin and receive DFiUSD. The deposit enters the reserve at the target split.</p>
            </article>
            <article className={s.card}>
              <div className={s.cardHead}><span className={s.num}>02</span><h3 className="h3">hold</h3></div>
              <div aria-hidden="true" className={s.dia}>
                <div className={s.diaHead}><span className="label-sm">ERC-20 · ETHEREUM MAINNET</span></div>
                <div className={s.diaRow}>
                  <DfiChip />
                  <span className="mono dim">→</span>
                  <div className={s.diaCol}><MiniBar /><span className="label-sm" style={{ letterSpacing: '.02em', whiteSpace: 'nowrap' }}>BACKED BY ALL SEVEN</span></div>
                </div>
              </div>
              {/* TODO(open item 2): "plain ERC-20" is inaccurate (rebasing, freezable). Reword with compliance. */}
              <p className="dim pretty">DFiUSD is a plain ERC-20 on Ethereum. Hold it, send it, or trade it on Uniswap.</p>
            </article>
            <article className={`${s.card} ${s.cardDashed}`}>
              <div className={s.cardHead} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div className={s.cardHead}><span className={s.num}>03</span><h3 className="h3">stake</h3></div>
                <span className={s.soon}>COMING SOON</span>
              </div>
              <div className={`${s.dia} ${s.diaDashed}`}>
                <div aria-label="DiversiFi Vault" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mark size={20} />
                  <span className="mono" style={{ fontWeight: 500, fontSize: 18, lineHeight: 1, letterSpacing: '-0.03em' }}>diversifi</span>
                  <i aria-hidden="true" style={{ width: 1, height: 20, margin: '0 4px', background: 'var(--strong)' }} />
                  <span className="mono" style={{ fontWeight: 500, fontSize: 13, lineHeight: 1, letterSpacing: '.04em' }}>VAULT</span>
                </div>
                <div aria-hidden="true" className={s.diaRow}>
                  <DfiChip />
                  <span className="mono dim">→</span>
                  <div className={s.diaCol}><span className={s.slots}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span><span className="label-sm" style={{ letterSpacing: '.02em', whiteSpace: 'nowrap' }}>6 STRATEGY VAULTS</span></div>
                </div>
              </div>
              <p className="dim pretty">Stake DFiUSD to earn variable yield across six strategy vaults. Coming soon.</p>
            </article>
          </div>
        </section>

        {/* 04 THE RESERVE */}
        <ReserveSection />

        {/* 05 IF AN ISSUER FAILS */}
        <section id="issuer-fails" aria-label="if an issuer fails" className={s.band}>
          <div className={`wrap ${s.bandIn}`}>
            <div className="rail"><span>05 · IF AN ISSUER FAILS</span><span>EXPLAINER · ILLUSTRATIVE SPLIT</span></div>
            <div className={s.ifLayout}>
              <div className={s.ifLeft}>
                <h2 className="h2s">one issuer breaks. it only touches its slice.</h2>
                <p className="small dim pretty">Contained, not prevented. Four contract steps, none automatic.</p>
                <IssuerVisual />
                <a href={DOCS_URL} target="_blank" rel="noopener" className="btn btn-secondary" style={{ alignSelf: 'flex-start', marginTop: 8 }}>read the docs ↗</a>
              </div>
              <div className={s.ifRight}>
                <div>
                  <div className={s.groupHead}><span>IN A FAILURE · 4 STEPS</span><span className="dim">NONE AUTOMATIC</span></div>
                  {STEPS.map((st, i) => (
                    <div key={i} data-step={i} className={s.step}>
                      <span className={s.stepNum}>0{i + 1}</span>
                      <div className={s.stepIcon}>{st.icon}</div>
                      <div className={s.stepText}><h3 className={s.stepTitle}>{st.title}</h3><p className={s.stepBody}>{st.body}</p></div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className={s.groupHead}><span>ALWAYS ON · 4 SAFEGUARDS</span><span className="dim">FROM THE DOCS</span></div>
                  {GUARDS.map((g, i) => (
                    <div key={i} className={`${s.step} ${s.guard}`}>
                      <span className={s.stepNum}>{'ABCD'[i]}</span>
                      <div className={s.stepIcon}><div aria-hidden="true" className={s.mini}>{g.icon}</div></div>
                      <div className={s.stepText}><h3 className={s.guardTitle}>{g.title}</h3><p className={s.stepBody}>{g.body}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 06 FOR INTEGRATORS */}
        <section id="docs" aria-label="for integrators" className={`wrap ${s.section}`}>
          <div className="rail"><span>06 · FOR INTEGRATORS</span><span>CONTRACTS · ADDRESSES · DOCS</span></div>
          <div className={s.intGrid}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2 className="h2">reserves on-chain, verifiable anytime.</h2>
              {/* TODO(open item 2): disclose rebasing and maintainer freezing; "plain ERC-20" needs rewording. */}
              <p className="dim pretty" style={{ maxWidth: '32em' }}>DFiUSD is a plain ERC-20 collateral asset that spreads issuer risk across seven coins. The token and ReserveManagerV1 are source-verified on Etherscan.</p>
              <div className={s.ctaRow}>
                <a href={DOCS_URL} target="_blank" rel="noopener" className="btn btn-secondary">read the docs ↗</a>
                <a href={CONTACT_MAIL} className="btn btn-secondary">talk to us</a>
              </div>
            </div>
            <dl className={s.dl}>
              <div><dt>TOKEN</dt><dd><span>DFiUSD · ERC-20</span><a href={tokenUrl} target="_blank" rel="noopener" aria-label="DFiUSD token on Etherscan">0xDF10…AfBf →</a></dd></div>
              <div><dt>RESERVE CONTRACT</dt><dd><span>ReserveManagerV1</span><a href={rmUrl} target="_blank" rel="noopener" aria-label="ReserveManagerV1 on Etherscan">0x8978…8327 →</a></dd></div>
              <div><dt>NETWORK</dt><dd>Ethereum mainnet</dd></div>
              <div><dt>LIVE SINCE</dt><dd><span>Sep 2025</span><a href={`${ETHERSCAN}/tx/${DEPLOY_TX}`} target="_blank" rel="noopener" aria-label="DFiUSD deployment transaction on Etherscan">deployment tx →</a></dd></div>
              <div><dt>SOURCE</dt><dd>verified on Etherscan</dd></div>
              {/* TODO(open item 4): link both audit reports once public. */}
              <div><dt>AUDITS</dt><dd><span>Nethermind · 20 Aug 2025</span>{CERTIK_PUBLIC && <span>CertiK · [date]</span>}</dd></div>
              <div><dt>DECIMALS</dt><dd>18</dd></div>
            </dl>
          </div>
        </section>

        {/* 07 FINAL CTA */}
        <section aria-label="get started" className={`gridbg ${s.final}`}>
          <Crops />
          <div className={`wrap ${s.finalIn}`}>
            <p className={s.finalLine}>proof, not promises.</p>
            <Ruler ticks={41} />
            <div className={s.finalGrid}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <span className="label">ONE TOKEN · SEVEN STABLECOINS UNDERNEATH</span>
                <Link href="/app" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>open app</Link>
                <nav aria-label="resources" className={s.resLinks}>
                  <a href={DOCS_URL} target="_blank" rel="noopener">docs ↗</a>
                  <a href={WHITEPAPER_URL} target="_blank" rel="noopener">whitepaper ↗</a>
                  <a href={TERMS_URL} target="_blank" rel="noopener">terms of service ↗</a>
                  <a href={X_URL} target="_blank" rel="noopener">X ↗</a>
                </nav>
                <footer className={s.sign}>
                  <Wordmark size={21} mark={24} />
                  <span className="mono dim" style={{ fontSize: 13 }}>© 2026 DiversiFi</span>
                </footer>
              </div>
              <Signup />
            </div>
          </div>
        </section>
      </main>

    </ReserveProvider>
  );
}

/* ---------- section 05 glyphs (div-built, aria-hidden) ---------- */
const Bar = ({ flex, h, crit = 3 }: { flex: number[]; h: number; crit?: number }) => (
  <div className={s.gbar} style={{ height: h }}>{flex.map((f, i) => <i key={i} className={i === crit ? s.c : undefined} style={{ flex: f }} />)}</div>
);
const EVEN7 = [1, 1, 1, 1, 1, 1, 1];
const LATER = [1.1, 1.1, 1.1, 0.3, 1.1, 1.1, 1.1];

const STEPS = [
  {
    title: 'the loss stays in its slice.',
    body: 'A failing coin affects only its share of the backing. The other six coins sit in the reserve as before.',
    icon: (
      <div aria-hidden="true" className={s.glyph}>
        <Bar flex={EVEN7} h={28} />
        <div style={{ display: 'flex', gap: 2 }}><i style={{ flex: 3 }} /><span style={{ flex: 4, display: 'flex', flexDirection: 'column', gap: 6 }}><i style={{ display: 'block', width: 2, height: 10, background: 'var(--dim)' }} /><span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.02em', color: 'var(--crit)', whiteSpace: 'nowrap' }}>ONE ISSUER FAILS</span></span></div>
      </div>
    ),
  },
  {
    title: 'its target is set to 0%.',
    body: "The failing coin's target share can be set to 0%. The other six targets take up its share.",
    icon: <div aria-hidden="true" className={s.glyphGrid}><span>TARGET</span><Bar flex={[1, 1, 1, 1, 1, 1]} h={20} crit={-1} /><span>NOW</span><Bar flex={EVEN7} h={20} /></div>,
  },
  {
    title: 'swaps only run toward target.',
    body: 'Each swap moves the reserve closer to the new target, so the failing coin is pushed out over time.',
    icon: <div aria-hidden="true" className={s.glyphGrid}><span>BEFORE</span><Bar flex={EVEN7} h={20} /><span>LATER</span><Bar flex={LATER} h={20} /></div>,
  },
  {
    title: 'minting can be paused.',
    body: 'New mints can be stopped while the failing coin is still in the reserve.',
    icon: (
      <div aria-hidden="true" className={s.glyph} style={{ gap: 12 }}>
        <span className="chip chip-sm" style={{ alignSelf: 'flex-start' }}><i className={s.pauseSq} />MINT · PAUSED</span>
        <div style={{ opacity: 0.55 }}><Bar flex={LATER} h={20} /></div>
      </div>
    ),
  },
];

const blk = (h: number, bg = 'var(--strong)', extra?: React.CSSProperties) => ({ height: h, background: bg, ...extra });

const GUARDS = [
  {
    // TODO(open item 3): insurance-fund claim needs compliance sign-off.
    title: 'insurance fund.',
    body: 'Swap fees go to an insurance fund that can buy a failing asset out of the reserve.',
    icon: (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {[0, 1, 2].map(i => <i key={i} className={s.blk} style={blk(24)} />)}
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}><i className={s.blk} style={blk(10, 'var(--signal)')} /><i className={s.blk} style={blk(11, 'var(--crit)')} /></span>
        {[0, 1, 2].map(i => <i key={i} className={s.blk} style={blk(24)} />)}
      </div>
    ),
  },
  {
    title: 'capped growth.',
    body: 'Total reserves have a cap. It can only rise at a set rate, with a cooldown between increases.',
    icon: (
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 3, paddingTop: 8 }}>
        <i style={{ position: 'absolute', top: 0, left: -2, right: -2, borderTop: '1.5px dashed var(--dim)' }} />
        {[10, 16, 22, 28].map(h => <i key={h} className={s.blk} style={blk(h)} />)}
      </div>
    ),
  },
  {
    title: "a frozen coin can't trap the rest.",
    body: "If one coin can't be transferred out, an emergency mode lets the other six still be withdrawn.",
    icon: (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {EVEN7.map((_, i) => <i key={i} className={s.blk} style={i === 3 ? blk(24, 'transparent', { border: '1.5px dashed var(--crit)' }) : blk(24, 'var(--fg)')} />)}
      </div>
    ),
  },
  {
    title: 'anyone can rebalance.',
    body: 'A bounty pays whoever moves the reserve back to its target split.',
    icon: (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 8px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2 }}>{[14, 8, 10, 12].map((w, i) => <i key={i} style={{ display: 'block', width: w, height: 8, borderRadius: 1, background: 'var(--strong)' }} />)}</div>
        <span className="mono dim" style={{ fontSize: 10 }}>NOW</span>
        <div style={{ display: 'flex', gap: 2 }}>{[0, 1, 2, 3].map(i => <i key={i} style={{ display: 'block', width: 11, height: 8, borderRadius: 1, background: 'var(--signal)' }} />)}</div>
        <span className="mono dim" style={{ fontSize: 10 }}>TARGET</span>
      </div>
    ),
  },
];

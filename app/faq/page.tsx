import type { Metadata } from 'next';
import Link from 'next/link';
import { Crops, Wordmark } from '@/components/brand';
import { DOCS_URL, TERMS_URL, WHITEPAPER_URL, X_URL } from '@/lib/coins';
import { faqs, faqText } from '@/lib/faq';
import { FALLBACK_READING, readReserve } from '@/lib/reserve';
import { og } from '@/lib/site';
import shell from '../terms/terms.module.css';
import s from './faq.module.css';

// Fee and target split are read from the chain, so refresh like the home page.
export const revalidate = 60;

const DESC = 'Answers about DFiUSD: what backs it, what happens if a stablecoin depegs, fees, redemption, audits and risks.';

export const metadata: Metadata = {
  title: 'DFiUSD FAQ: backing, fees, redemption and risks',
  description: DESC,
  alternates: { canonical: '/faq' },
  openGraph: og('/faq', 'DFiUSD FAQ · DiversiFi', DESC),
};

export default async function Faq() {
  let reading = FALLBACK_READING;
  let ok = true;
  try { reading = await readReserve(); } catch { ok = false; }
  const items = faqs(reading, ok);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: faqText(f.a) } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav aria-label="primary" className={shell.nav}>
        <div className={`wrap ${shell.navIn}`}>
          <Link href="/" aria-label="DiversiFi home" className={shell.logo}><Wordmark /></Link>
          <Link href="/app" className="btn btn-primary btn-nav">open app</Link>
        </div>
      </nav>

      <main>
        <header className={`gridbg ${shell.head}`}>
          <Crops />
          <div className={`wrap ${shell.headIn}`}>
            <div className="rail"><span>FAQ</span><span>BACKING · FEES · REDEMPTION · RISK</span></div>
            <h1 className="h1">questions about DFiUSD.</h1>
          </div>
        </header>

        <div className={`wrap ${s.body}`}>
          {items.map((f, n) => (
            <section key={f.q} className={s.item} aria-labelledby={`q${n}`}>
              <h2 id={`q${n}`} className={s.q}><span className={s.num}>{String(n + 1).padStart(2, '0')}</span>{f.q}</h2>
              <p className={s.a}>
                {f.a.map((seg, i) => typeof seg === 'string' ? seg : (
                  <a key={i} href={seg.href} {...(seg.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}>{seg.text}</a>
                ))}
              </p>
            </section>
          ))}
          <p className={s.more}>More detail on the mechanics and risks is in the <a href={DOCS_URL} target="_blank" rel="noopener">documentation ↗</a>.</p>
        </div>

        <footer className={shell.foot}>
          <div className={`wrap ${shell.footIn}`}>
            <nav aria-label="resources" className={shell.links}>
              <Link href="/">home</Link>
              <a href={DOCS_URL} target="_blank" rel="noopener">docs ↗</a>
              <a href={WHITEPAPER_URL} target="_blank" rel="noopener">whitepaper ↗</a>
              <a href={X_URL} target="_blank" rel="noopener">X ↗</a>
            </nav>
            <div className={shell.sign}>
              <Wordmark size={21} mark={24} />
              <span className="mono dim" style={{ fontSize: 13 }}>© 2026 DiversiFi</span>
              <nav aria-label="legal" className={shell.legal}>
                <Link href="/faq">faq</Link>
                <Link href={TERMS_URL}>terms of service</Link>
              </nav>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

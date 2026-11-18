import type { Metadata } from 'next';
import Link from 'next/link';
import { Crops, Wordmark } from '@/components/brand';
import { DOCS_URL, TERMS_URL, WHITEPAPER_URL, X_URL } from '@/lib/coins';
import { og } from '@/lib/site';
import content from './content.json';
import s from './terms.module.css';

// Legal text is verbatim from the published Terms of Service; only the presentation is ours.
type Block = { p: string } | { ul: string[] };
type Section = { n: string; title: string; blocks: Block[] };
const terms = content as { updated: string; intro: Block[]; sections: Section[] };

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of the DiversiFi website, the DFiUSD app and related services, including eligibility, fees, risks and dispute resolution.',
  alternates: { canonical: '/terms' },
  openGraph: og('/terms', 'Terms of Service · DiversiFi', 'The terms that govern your use of the DiversiFi website, app and services.'),
};

const slug = (sec: Section) => `s${sec.n}`;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const AUTO_LINK = /(https?:\/\/[^\s)]+[^\s).,;]|[\w.+-]+@[\w-]+\.[\w.]+[a-z])/g;

/* **bold** runs (the conspicuous legal passages) plus auto-linked URLs and email addresses. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
        const bold = part.startsWith('**') && part.endsWith('**');
        const body = bold ? part.slice(2, -2) : part;
        const linked = body.split(AUTO_LINK).map((bit, j) =>
          j % 2 ? <a key={j} href={bit.includes('@') ? `mailto:${bit}` : bit} target={bit.includes('@') ? undefined : '_blank'} rel="noopener">{bit}</a> : bit
        );
        return bold ? <strong key={i} className={s.caps}>{linked}</strong> : <span key={i}>{linked}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        'p' in b ? <p key={i}><Rich text={b.p} /></p> : (
          <ol key={i} className={s.list}>
            {b.ul.map((li, j) => <li key={j}><span className={s.li} aria-hidden="true">({LETTERS[j]})</span><span><Rich text={li} /></span></li>)}
          </ol>
        )
      )}
    </>
  );
}

export default function Terms() {
  return (
    <>
      <nav aria-label="primary" className={s.nav}>
        <div className={`wrap ${s.navIn}`}>
          <Link href="/" aria-label="DiversiFi home" className={s.logo}><Wordmark /></Link>
          <Link href="/app" className="btn btn-primary btn-nav">open app</Link>
        </div>
      </nav>

      <main>
        <header className={`gridbg ${s.head}`}>
          <Crops />
          <div className={`wrap ${s.headIn}`}>
            <div className="rail"><span>LEGAL · TERMS OF SERVICE</span><span>LAST UPDATED · {terms.updated.toUpperCase()}</span></div>
            <h1 className="h1">terms of service.</h1>
            <div className={s.intro}><Blocks blocks={terms.intro} /></div>
          </div>
        </header>

        <div className={`wrap ${s.body}`}>
          <aside className={s.toc}>
            <nav aria-label="sections">
              <span className="label">CONTENTS</span>
              <ol>
                {terms.sections.map(sec => (
                  <li key={sec.n}><a href={`#${slug(sec)}`}><span className={s.num}>{sec.n.padStart(2, '0')}</span>{sec.title}</a></li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className={s.text}>
            {terms.sections.map(sec => (
              <section key={sec.n} id={slug(sec)} aria-labelledby={`${slug(sec)}-h`} className={s.sec}>
                <h2 id={`${slug(sec)}-h`} className={s.h}><span className={s.num}>{sec.n.padStart(2, '0')}</span>{sec.title}</h2>
                <Blocks blocks={sec.blocks} />
              </section>
            ))}
          </article>
        </div>

        <footer className={s.foot}>
          <div className={`wrap ${s.footIn}`}>
            <nav aria-label="resources" className={s.links}>
              <Link href="/">home</Link>
              <a href={DOCS_URL} target="_blank" rel="noopener">docs ↗</a>
              <a href={WHITEPAPER_URL} target="_blank" rel="noopener">whitepaper ↗</a>
              <a href={X_URL} target="_blank" rel="noopener">X ↗</a>
            </nav>
            <div className={s.sign}>
              <Wordmark size={21} mark={24} />
              <span className="mono dim" style={{ fontSize: 13 }}>© 2026 DiversiFi</span>
              <nav aria-label="legal" className={s.legal}>
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

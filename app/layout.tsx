import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Host_Grotesk } from 'next/font/google';
import './globals.css';

// next/font downloads these at build time and serves them from our own origin as subset WOFF2.
const host = Host_Grotesk({ subsets: ['latin'], weight: ['300', '400', '500'], variable: '--font-host', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist-mono', display: 'swap' });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://diversifi.tech';
const DESC = 'DFiUSD is a USD token backed by a basket of seven stablecoins, held on Ethereum by the ReserveManagerV1 contract. Reserves are on-chain and verifiable anytime.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'DiversiFi · structured stability.',
  description: DESC,
  alternates: { canonical: '/' },
  icons: { icon: '/diversifi-mark-dark.svg', apple: '/app-icon-512.png' },
  openGraph: { type: 'website', url: '/', siteName: 'DiversiFi', title: 'DiversiFi · structured stability.', description: DESC, images: [{ url: '/og-1200x630.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: 'DiversiFi · structured stability.', description: DESC, images: ['/og-1200x630.png'] },
};

export const viewport: Viewport = { themeColor: '#0D0E10', colorScheme: 'dark' };

const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'DiversiFi',
  url: SITE,
  logo: `${SITE}/app-icon-512.png`,
  sameAs: ['https://docs.diversifi.tech/'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${host.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
        {children}
      </body>
    </html>
  );
}

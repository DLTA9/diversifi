import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted Latin-subset variable WOFF2 (OFL-1.1, from Fontsource). Bundled in the repo so builds
// never fetch from Google Fonts, which fails on Cloudflare's build machines.
const host = localFont({ src: './fonts/host-grotesk-latin-wght-normal.woff2', weight: '300 800', variable: '--font-host', display: 'swap' });
const mono = localFont({ src: './fonts/geist-mono-latin-wght-normal.woff2', weight: '100 900', variable: '--font-geist-mono', display: 'swap' });

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

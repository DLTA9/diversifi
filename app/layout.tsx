import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { CONTACT_EMAIL, og, SAME_AS, SITE_DESC, SITE_NAME, SITE_URL } from '@/lib/site';
import './globals.css';

// Self-hosted Latin-subset variable WOFF2 (OFL-1.1, from Fontsource). Bundled in the repo so builds
// never fetch from Google Fonts, which fails on Cloudflare's build machines.
const host = localFont({ src: './fonts/host-grotesk-latin-wght-normal.woff2', weight: '300 800', variable: '--font-host', display: 'swap' });
const mono = localFont({ src: './fonts/geist-mono-latin-wght-normal.woff2', weight: '100 900', variable: '--font-geist-mono', display: 'swap' });

const TITLE = 'DFiUSD · the diversified USD stablecoin · DiversiFi';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · DiversiFi' },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  icons: { icon: '/diversifi-mark-dark.svg', apple: '/app-icon-512.png' },
  openGraph: og('/', TITLE),
  twitter: { card: 'summary_large_image', site: '@0xDiversiFi', title: TITLE, description: SITE_DESC, images: ['/og-1200x630.png'] },
};

export const viewport: Viewport = { themeColor: '#0D0E10', colorScheme: 'dark' };

const siteLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/app-icon-512.png`,
      email: CONTACT_EMAIL,
      description: SITE_DESC,
      sameAs: SAME_AS,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: 'en',
      publisher: { '@id': `${SITE_URL}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${host.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }} />
        {children}
      </body>
    </html>
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import { isProdHost, SITE_URL } from '@/lib/site';

// Content Security Policy: the browser only runs our own scripts and only talks to the services listed here
// (Ethereum RPCs, WalletConnect/Reown, Coinbase Wallet). Anything else, e.g. an injected third-party script or a
// call to an unknown server, is blocked. Next.js static pages need inline scripts, so 'unsafe-inline' stays for
// script-src; dev mode also needs 'unsafe-eval' for hot reload.
const DEV = process.env.NODE_ENV === 'development';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.reown.com",
  "font-src 'self' data: https://fonts.reown.com",
  "img-src 'self' data: blob: https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com https://*.web3modal.com https://*.web3modal.org",
  [
    "connect-src 'self'",
    'https://ethereum-rpc.publicnode.com https://eth.llamarpc.com https://*.g.alchemy.com',
    'https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org',
    'https://*.reown.com https://*.web3modal.com https://*.web3modal.org',
    'https://*.coinbase.com wss://*.coinbase.com',
    DEV ? 'ws://localhost:* http://localhost:*' : '',
  ].join(' ').trim(),
  'frame-src https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.org https://*.reown.com https://keys.coinbase.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(DEV ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY', // older browsers; frame-ancestors covers modern ones
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  // allow-popups: Coinbase Wallet opens a popup and talks back to this window.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  ...(DEV ? {} : { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' }),
};

// Also keeps preview hosts (workers.dev, localhost) out of search indexes, and advertises the sitemap and llms.txt
// to agents via Link headers (RFC 8288).
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!isProdHost(host)) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Link', `<${SITE_URL}/sitemap.xml>; rel="sitemap"; type="application/xml", <${SITE_URL}/llms.txt>; rel="describedby"; type="text/plain"`);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.(?:png|svg|ico|woff2|txt|xml|pdf)$).*)'],
};

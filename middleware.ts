import { NextResponse, type NextRequest } from 'next/server';
import { isProdHost, SITE_URL } from '@/lib/site';

// Content Security Policy: the browser only runs our own scripts and only talks to the Ethereum connections listed
// here (for the live reserve figures). Anything else, e.g. an injected third-party script or a call to an unknown
// server, is blocked. The site has no wallet connection: the app lives at app.diversifi.tech. Next.js static pages
// need inline scripts, so 'unsafe-inline' stays for script-src; dev mode also needs 'unsafe-eval' for hot reload.
const DEV = process.env.NODE_ENV === 'development';
const CSP = [
  "default-src 'self'",
  // Cloudflare Web Analytics: the edge injects its beacon script, which reports visits to cloudflareinsights.com.
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${DEV ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  [
    "connect-src 'self' https://cloudflareinsights.com",
    'https://ethereum-rpc.publicnode.com https://eth.drpc.org https://eth.llamarpc.com https://*.g.alchemy.com',
    DEV ? 'ws://localhost:* http://localhost:*' : '',
  ].join(' ').trim(),
  "frame-src 'none'",
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
  'Cross-Origin-Opener-Policy': 'same-origin',
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

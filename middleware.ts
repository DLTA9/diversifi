import { NextResponse, type NextRequest } from 'next/server';
import { isProdHost, SITE_URL } from '@/lib/site';

// Keeps preview hosts (workers.dev, localhost) out of search indexes, and advertises the
// sitemap and llms.txt to agents on every page via Link headers (RFC 8288).
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!isProdHost(host)) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Link', `<${SITE_URL}/sitemap.xml>; rel="sitemap"; type="application/xml", <${SITE_URL}/llms.txt>; rel="describedby"; type="text/plain"`);
  return res;
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.(?:png|svg|ico|woff2|txt|xml|pdf)$).*)'],
};

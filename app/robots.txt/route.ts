import { AI_BOTS, isProdHost, SITE_URL } from '@/lib/site';

// Hand-written rather than app/robots.ts so it can carry Content-Signal lines and switch on the host.
export function GET(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');

  if (!isProdHost(host)) {
    return text(`# Preview host. The live site is ${SITE_URL}\nUser-agent: *\nDisallow: /\n`);
  }

  const rules = 'Allow: /\nDisallow: /api/\n';
  const body = [
    '# DiversiFi · DFiUSD',
    '# Content signals (https://contentsignals.org): search indexing, AI answers and AI training are all permitted.',
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    rules,
    ...AI_BOTS.map(bot => `User-agent: ${bot}\n${rules}`),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
  return text(body);
}

const text = (body: string) =>
  new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });

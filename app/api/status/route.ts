// The pause switch. Set APP_PAUSED=true (and optionally APP_PAUSED_MESSAGE) under Cloudflare → Workers → diversifi →
// Settings → Variables and Secrets. The app reads this on load and again right before every signature, and switches
// all transactions off while it is true. Reading pages and the reserve keeps working.
export const dynamic = 'force-dynamic';

export function GET() {
  const paused = (process.env.APP_PAUSED ?? '').trim().toLowerCase() === 'true';
  const message = paused ? (process.env.APP_PAUSED_MESSAGE ?? '').slice(0, 280) : '';
  return Response.json({ paused, message }, { headers: { 'cache-control': 'no-store' } });
}

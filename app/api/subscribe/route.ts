import { NextResponse } from 'next/server';

const okEmail = (v: unknown): v is string => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Monthly reserve reading signup. Forwards to SUBSCRIBE_WEBHOOK_URL (your ESP / list provider).
 * TODO: choose the email provider; without the env var this only validates.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = body?.email;
  if (!okEmail(email)) return NextResponse.json({ error: 'invalid email' }, { status: 400 });

  const hook = process.env.SUBSCRIBE_WEBHOOK_URL;
  if (hook) {
    const r = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), list: 'monthly-reserve-reading' }) });
    if (!r.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

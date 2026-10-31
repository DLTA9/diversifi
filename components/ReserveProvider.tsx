'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { POLL_MS, readReserve, STALE_MS, type ReserveMode, type ReserveReading } from '@/lib/reserve';

type Ctx = { reading: ReserveReading; mode: ReserveMode; refresh: () => void; ageMin: number };
const ReserveCtx = createContext<Ctx | null>(null);

export function useReserve() {
  const v = useContext(ReserveCtx);
  if (!v) throw new Error('useReserve outside ReserveProvider');
  return v;
}

/**
 * Holds the reserve reading. The server pre-renders `initial` so crawlers see real figures;
 * the client re-reads on mount, every 60s and on window focus.
 */
export function ReserveProvider({ initial, initialOk, children }: { initial: ReserveReading; initialOk: boolean; children: React.ReactNode }) {
  const [reading, setReading] = useState(initial);
  const [failed, setFailed] = useState(!initialOk);
  const [now, setNow] = useState(initial.readAt);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await readReserve();
      setReading(r);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(poll); clearInterval(tick); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const age = Math.max(0, now - reading.readAt);
  const mode: ReserveMode = failed ? 'unavailable' : age > STALE_MS ? 'stale' : 'live';

  return <ReserveCtx.Provider value={{ reading, mode, refresh, ageMin: Math.round(age / 60_000) }}>{children}</ReserveCtx.Provider>;
}

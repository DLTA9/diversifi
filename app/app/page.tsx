import type { Metadata } from 'next';
import { AppFlow } from '@/components/AppFlow';
import { ReserveProvider } from '@/components/ReserveProvider';
import { Web3Providers } from '@/components/Web3Providers';
import { FALLBACK_READING, readReserve } from '@/lib/reserve';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'DiversiFi · mint and redeem DFiUSD',
  alternates: { canonical: '/app' },
};

export default async function AppPage() {
  let initial = FALLBACK_READING;
  let ok = true;
  try { initial = await readReserve(); } catch { ok = false; }
  return (
    <ReserveProvider initial={initial} initialOk={ok}>
      <Web3Providers>
        <AppFlow />
      </Web3Providers>
    </ReserveProvider>
  );
}

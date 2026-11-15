import type { Metadata } from 'next';
import { AppFlow } from '@/components/AppFlow';
import { ReserveProvider } from '@/components/ReserveProvider';
import { Web3Providers } from '@/components/Web3Providers';
import { FALLBACK_READING, readReserve } from '@/lib/reserve';
import { og } from '@/lib/site';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Mint and redeem DFiUSD',
  description: 'Swap, mint or redeem DFiUSD against its multi-stablecoin reserve, from your own wallet on Ethereum mainnet.',
  alternates: { canonical: '/app' },
  openGraph: og('/app', 'Mint and redeem DFiUSD · DiversiFi', 'Swap, mint or redeem DFiUSD against its multi-stablecoin reserve, from your own wallet on Ethereum mainnet.'),
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

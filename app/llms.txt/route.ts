import { AUDIT_URL, COINS, DEPLOY_TX, DOCS_URL, ETHERSCAN, RM_ADDR, TOKEN_ADDR, WHITEPAPER_URL, X_URL } from '@/lib/coins';
import { faqs, faqText } from '@/lib/faq';
import { FALLBACK_READING, fmtBlock, readReserve, type ReserveReading } from '@/lib/reserve';
import { SITE_URL } from '@/lib/site';

// llms.txt (https://llmstxt.org): a plain-text brief for AI assistants, with the live reserve split.
export const revalidate = 3600;

export async function GET() {
  let r: ReserveReading | null = null;
  try { r = await readReserve(); } catch { /* serve the static facts without the live table */ }

  const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  const reserve = r
    ? [
        `## Reserve (read from Ethereum at block ${fmtBlock(r.block)}, ${new Date(r.readAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
        '',
        '| Coin | Issuer | Held | Share | Target |',
        '|---|---|---|---|---|',
        ...COINS.map((c, i) => `| ${c.t} | ${c.issuer} | ${usd(r!.coins[i].held)} | ${r!.coins[i].current.toFixed(1)}% | ${r!.coins[i].target.toFixed(1)}% |`),
        `| Total | | ${usd(r.total)} | 100.0% | 100.0% |`,
        '',
      ]
    : [];

  const body = [
    '# DiversiFi',
    '',
    '> DiversiFi issues DFiUSD, a USD stablecoin on Ethereum backed 1:1 by a basket of seven USD stablecoins (USDC, DAI, USDS, USDT, GHO, FDUSD, frxUSD) held in the ReserveManagerV1 smart contract. Spreading the backing across issuers means one failing stablecoin only affects its share of the reserve. Every balance is readable on-chain.',
    '',
    '## Key facts',
    '',
    '- Token: DFiUSD, ERC-20 on Ethereum mainnet',
    `- Token contract: ${TOKEN_ADDR} (${ETHERSCAN}/token/${TOKEN_ADDR})`,
    `- Reserve contract: ReserveManagerV1, ${RM_ADDR} (${ETHERSCAN}/address/${RM_ADDR})`,
    `- Live since: September 2025 (deployment transaction ${ETHERSCAN}/tx/${DEPLOY_TX})`,
    '- Source code: verified on Etherscan',
    `- Security audits: Nethermind (${AUDIT_URL}); CertiK`,
    '- Diversification reduces single-issuer exposure; it does not eliminate risk.',
    '',
    ...reserve,
    '## FAQ',
    '',
    ...faqs(r ?? FALLBACK_READING, !!r).flatMap(f => [`### ${f.q}`, '', faqText(f.a), '']),
    '## Links',
    '',
    `- [Home](${SITE_URL}/): what DFiUSD is, the live reserve, and what happens if an issuer fails`,
    `- [Mint and redeem](${SITE_URL}/app): the DiversiFi app`,
    `- [FAQ](${SITE_URL}/faq): backing, depegs, fees, redemption, audits and risks`,
    `- [Documentation](${DOCS_URL}): protocol mechanics, contract API and risks`,
    `- [Whitepaper](${WHITEPAPER_URL}): PDF`,
    `- [Nethermind audit](${AUDIT_URL}): PDF`,
    `- [Terms of Service](${SITE_URL}/terms)`,
    `- [X](${X_URL}): announcements`,
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

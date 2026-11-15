import { CONTACT_MAIL, DOCS_URL, X_URL } from './coins';

// Canonical origin. Every other host (workers.dev previews, localhost) is kept out of search indexes.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://diversifi.tech').replace(/\/$/, '');
const PROD_HOSTS = new Set([new URL(SITE_URL).host, 'www.' + new URL(SITE_URL).host]);
export const isProdHost = (host: string | null) => !!host && PROD_HOSTS.has(host.toLowerCase());

export const SITE_NAME = 'DiversiFi';
export const SITE_DESC = 'DFiUSD is a USD stablecoin backed 1:1 by a diversified basket of USDC, USDT, DAI, USDS, GHO, FDUSD and frxUSD on Ethereum, with reserves verifiable on-chain.';
export const SAME_AS = [X_URL, DOCS_URL];
export const CONTACT_EMAIL = CONTACT_MAIL.replace(/^mailto:/, '');

// Per-page Open Graph block. Next.js replaces (not merges) a parent's openGraph, so the image is repeated here.
export const OG_IMAGE = { url: '/og-1200x630.png', width: 1200, height: 630, alt: 'DiversiFi · one token, a basket of stablecoins underneath.' };
export const og = (path: string, title: string, description = SITE_DESC) =>
  ({ type: 'website' as const, url: path, siteName: SITE_NAME, title, description, images: [OG_IMAGE] });

// Crawlers named explicitly so AI-bot rules are unambiguous. A bot that matches its own group ignores `*`,
// so each group repeats the same rules.
export const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'meta-externalagent',
];

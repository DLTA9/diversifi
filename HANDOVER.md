# diversifi.tech: handover

The marketing site for DFiUSD: home page, `/faq`, `/terms`, the whitepaper and audit PDFs, and the search and AI files. It has **no wallet connection and no transaction code**. Every "open app" and "get DFiUSD" button links to the app at **https://app.diversifi.tech**, which runs from the `v1-interface` repo.

The site only *reads* public data: the live reserve figures come from the ReserveManagerV1 contract (`0x8978F3A0227453Dd0821bC8A85e4bEF96DAF8327`) through an Ethereum RPC.

## Stack

- Next.js 16 (App Router) + TypeScript, deployed to **Cloudflare Workers** with OpenNext (`@opennextjs/cloudflare`)
- `viem` for the read-only contract calls
- Every dependency is pinned to an exact version

| Task | Command |
|---|---|
| Local development | `npm install`, then `npm run dev` (http://localhost:3000) |
| Production build | `npx opennextjs-cloudflare build` |
| Deploy | `npx opennextjs-cloudflare deploy` |

For **Cloudflare Workers Builds**, connect this repo and set the deploy command to `npx opennextjs-cloudflare deploy`. The build command is `npx opennextjs-cloudflare build`.

## Settings to set in your Cloudflare account

Set these under Workers & Pages → (worker) → Settings → Variables and Secrets.

| Name | Type | Needed? | What it does |
|---|---|---|---|
| `RPC_URL` | **Secret** | Strongly recommended | A private Ethereum mainnet RPC URL (Alchemy, Infura or similar). Used on the server for the reserve figures. Never sent to browsers. Without it, the site falls back to public RPCs, which are slower and sometimes fail. |
| `SUBSCRIBE_WEBHOOK_URL` | Secret | Only for the sign-up form | Where the "monthly reserve reading" sign-up form sends email addresses: your email provider's webhook. It receives `POST {"email": "...", "list": "monthly-reserve-reading"}`. Without it, the form shows an error and stores nothing. |
| `NEXT_PUBLIC_RPC_URL` | Build variable | Optional | An RPC the **browser** uses to refresh the reserve figures every minute. If you set one, use a key restricted to your domain: it is visible to visitors. Without it, browsers use a public RPC. |
| `NEXT_PUBLIC_SITE_URL` | Build variable | Optional | The canonical address. Defaults to `https://diversifi.tech`. Every other host, such as `*.workers.dev` previews, automatically gets a "noindex" header. |

## Cloudflare resources

Defined in `wrangler.jsonc`:

- **Worker name:** `diversifi`. If you rename it, change both `name` and the `WORKER_SELF_REFERENCE` service to the same new name.
- **R2 bucket:** `diversifi-cache` (binding `NEXT_INC_CACHE_R2_BUCKET`), the page cache. Create it once in R2 with that exact name, or change `bucket_name`. It uses about 2 MB, well inside R2's free tier.
- **Route:** add `diversifi.tech` (and `www.diversifi.tech` if you use it) as a custom domain or route for the worker.

## Go-live checklist

- [ ] `RPC_URL` set, R2 bucket created, first deploy succeeds
- [ ] diversifi.tech points at the worker. Check `/`, `/faq`, `/terms`, `/docs/whitepaper.pdf`, `/docs/diversifi-audit.pdf`, `/sitemap.xml`, `/robots.txt` and `/llms.txt`
- [ ] DNSSEC on, CAA records set (for example, only your certificate authority may issue), domain auto-renew on
- [ ] Google Search Console and Bing Webmaster Tools verified; sitemap submitted
- [ ] Re-run https://isitagentready.com and PageSpeed Insights on the real domain

## Safety built in

- Security headers on every page (`middleware.ts`): a content security policy that only allows the site's own scripts and the listed Ethereum RPCs, no framing, HSTS, nosniff, and a strict referrer policy
- Preview hosts are kept out of search engines automatically
- No secrets in the repository; `.env.production` holds public settings only

## History

This repo used to contain an app page at `/app`. That page and its wallet and transaction code were removed before handover. The app design now lives in `v1-interface`.

# DiversiFi: wallet, contract and live-data integration plan

Prepared 15 Nov 2026 for the next working session. Goal: connect the new front end (this repo) to the existing on-chain system safely. Nothing here has been built yet unless it says so.

Sources: the live app bundle at app.diversifi.tech, docs.diversifi.tech (contract API, terms), Sourcify-verified sources, and direct on-chain reads on 15 Nov 2026.

---

## Start here (next session)

**Where things stand (15 Nov 2026):**
- **Website:** home, /app (swap + mint & redeem), /faq and /terms are live on the preview (diversifi.wispy-sky-e4f3.workers.dev). diversifi.tech still shows the old site.
- **App:** the designs are finished. Mint & redeem (full basket and one-coin rebalancing) are wired to the contract but untested with real funds. Swap is laid out, with its button disabled and a Uniswap link instead.
- **Speed and SEO:** page cache (R2), robots, sitemap, llms.txt and FAQ are all done.

**What to have open before we begin:**
1. VS Code with the `web` folder open, plus GitHub Desktop
2. The Cloudflare dashboard, logged in
3. A browser to make two free accounts: alchemy.com and cloud.reown.com

**First hour, step by step:**
1. Do `CLIENT-CHECKLIST.md` part 1, items 1–7: Alchemy key, Reown ID, DNSSEC, CAA, auto-renew, alerts, GitHub protection. I'll walk through every click.
2. Send the client the four questions in part 2. We don't wait for answers.
3. Start section 5, step 1 (the safety foundation).

**How we work:**
- Explain everything in plain words.
- Ask one simple question at a time.
- I commit; the user pushes from GitHub Desktop.
- Never press "Pull origin" without checking first.

---

## 1. What exists on-chain (verified)

| Contract | Address (Ethereum mainnet) | Notes |
|---|---|---|
| ReserveManagerV1 | `0x8978F3A0227453Dd0821bC8A85e4bEF96DAF8327` | mint, burn, swapTowardsTarget, equalizeToTarget, withdrawAll |
| DFiUSD (IndexToken) | `0xDF100b8ABd3cd41fC5cC1236AD7c6629A901AfBf` | rebasing ERC-20, EIP-2612 `permit`, `isFrozen`, migration |
| ReserveManagerHelpers | `0x3E706f1D975BF76e259939Bd741C36A88A6F0D13` | `quoteMint(amount)`, `quoteBurn(amount)` return exact per-asset amounts + fee. Use these for quotes. |
| TimelockController | `0x00890D5630f8e46aCFabDE50cD260acc5c605D33` | min delay 604,800 s (7 days); owns DFiUSD; holds ADMIN_ROLE on the reserve |

**Sepolia uses the same addresses** (docs). A wallet on Sepolia would talk to the test deployment at identical addresses. Every write must be pinned to chain 1 and re-checked right before signing.

Live state (15 Nov 2026): mint enabled, not emigrating, token not migrating, rebase rate 0, unsafe burn off, no cross-chain messengers, equalization bounty 0, basket equalized, fees 0.

Asset order on-chain (`getAllAssets`): USDC, USDS, DAI, USDT, frxUSD, FDUSD, GHO. It differs from our display order, so always match by address, never by index.

Contract behaviour that matters for the UI:
- `mint(amount, "0x")` pulls every target asset at the target split, plus fee (`getCompoundingMintFeeQ96`), plus 1 unit rounding per asset. Requires approvals for every asset.
- `burn(amount, false, "0x")` pays the current mix. No approvals needed.
- `swapTowardsTarget(asset, +delta)`: deposit one asset, mint DFiUSD 1:1 (+ bounty share). Only allowed up to the gap below target. No fee.
- `swapTowardsTarget(asset, −delta)`: withdraw one asset, burn DFiUSD 1:1 (− bounty share). Only allowed down to target. Burns via `burnFrom`, so no DFiUSD approval needed.
- Bounty share = pool × (discrepancy resolved ÷ discrepancy before), where discrepancy = sum of |equalization vector| (`getTotalReservesDiscrepencyScaled`). Get exact numbers by simulating the call, not by estimating (our current UI estimate is approximate).
- Neither swapTowardsTarget direction can make the user worse than 1:1 on the asset side; the bounty only adds. A sandwich can only reduce the bonus, not the principal. Still simulate and show the exact result.

Uniswap V4 pools: DFiUSD paired with all seven coins, **no hook** (pool key: `fee = 100`, `tickSpacing = 1`, `hooks = 0x0`). Liquidity (DexScreener, 15 Nov): USDC ~$280k, DAI ~$45k, USDS ~$45k, USDT ~$30k, GHO ~$30k, FDUSD ~$30k; frxUSD is not listed there but quotes fine.

Live V4Quoter quotes, 15 Nov 2026, coin → DFiUSD:

| Coin | For 100 | For 10,000 |
|---|---|---|
| USDC | 99.99 | 9,996.90 |
| DAI | 99.99 | 9,987.75 |
| USDS | 99.98 | 9,987.19 |
| frxUSD | 99.98 | 9,981.37 |
| USDT | 99.95 | 9,978.35 |
| GHO | 99.89 | 9,973.07 |
| FDUSD | 99.50 | reverts (not enough liquidity) |

The swap tab must show the price impact and refuse amounts the pool can't fill.

---

## 2. How the current app (app.diversifi.tech) does it

Vite + React SPA, wagmi + viem, **ConnectKit** for the wallet modal, sonner toasts, react-query.

- **Mint/burn:** writes `mint(amount,"0x")` / `burn(amount,false,"0x")` directly. Gas estimate via `estimateContractGas`, priced with ETH from an unidentified AWS endpoint (`…execute-api.ap-northeast-1.amazonaws.com/mainnet/metadata-service/v1/prices`).
- **Approvals:** ERC-20 `approve(reserveManager, exact | unlimited)`: a flag switches to an unlimited amount.
- **Swap:** Uniswap V4 via Universal Router `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af`, quotes from V4Quoter `0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203`, Permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3` approved on-chain (not by signature), `amountOutMinimum` from the quote, deadline now + 20 min, single-hop `V4_SWAP` with `SWAP_EXACT_IN_SINGLE` / settle / take.
- **What the old app offers:** three tabs, Mint and Burn (the full-basket `mint`/`burn`) and Swap (through Uniswap). Its own label: "Swap between reserve assets and the backed token."
- **What it does not offer:** a button for the one-coin rebalancing. `swapTowardsTarget` is live in the contract and anyone can call it (e.g. on Etherscan), but the old website never calls it (the ABI is bundled but unused). So: basket mint/redeem = existing on the old site; swap = existing on the old site via Uniswap; one-coin rebalancing = existing in the contract, new as a website feature.
- **Charts:** The Graph subgraph `DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G` with an empty API key, so charts fall back to placeholder data.
- **Headers:** no CSP, HSTS or frame protection.

We keep: direct contract calls, V4 Universal Router + Permit2 on-chain approvals for swaps, min-out + deadline. We improve: exact approvals by default, simulation before every write, helper quotes, runtime contract checks, security headers, no unknown third-party endpoints.

---

## 3. Security plan

### 3.1 Transaction safety (non-negotiable)
1. **Address allowlist in code**, checksummed constants for every contract and asset. No address ever comes from user input, URL or an API.
2. **Runtime sanity checks on load** and before every write: `RM.getIndexToken() == DFIUSD`, `DFIUSD.getReserveManager() == RM`, `RM.isEmigrating() == false`, `DFIUSD.isMigrating() == false`; asset list from `getTargetAssetParams` must be a subset of our known-token registry. Any mismatch → writes disabled, banner shown.
3. **Chain pinning:** pass `chainId: 1` to every write; re-check `useAccount().chainId === 1` immediately before `writeContract`; refuse otherwise. (Sepolia shares addresses.)
4. **Simulate every write** (`simulateContract`) with the user's account at the latest block. Show the simulated result on the review screen. If simulation fails, don't offer the button.
5. **Re-quote at confirm time:** re-read fee, mint-enabled, bounty and quotes just before signing; if anything moved beyond tolerance, return to review with the new numbers.
6. **Exact approvals only** by default, for the precise amount from the helper quote. No unlimited approvals unless the user opts in explicitly, with a warning. Show "revoke" guidance.
7. **USDT quirks:** reset allowance to 0 before changing a non-zero one (already done); `approve` returns no bool, so use an ABI without a return value for USDT when simulating.
8. **Swaps:** quote with V4Quoter, `amountOutMinimum = quote × (1 − slippage)` (default 0.1% for stable pairs, user-adjustable with a cap), deadline ≤ 20 min, Permit2 approval for the exact amount with a short expiration (on-chain `approve`, not off-chain signatures).
9. **Never ask for** `eth_sign`, `personal_sign` of arbitrary data, or `setApprovalForAll`. Only typed-data signatures we construct ourselves (e.g. a DFiUSD/USDC permit), shown in plain words first.
10. **BigInt everywhere** for amounts sent on-chain; decimals read from chain. Floats only for display.
11. **Frozen accounts:** check `DFIUSD.isFrozen(user)`; explain instead of letting the transaction revert.
12. **Receipts:** wait for the receipt, handle replaced/cancelled transactions (viem `onReplaced`), refetch balances after.

### 3.2 Website and supply chain
- **Security headers** (middleware): CSP with `script-src 'self'` (+ hashes/nonces Next.js needs), `connect-src` limited to our RPC, WalletConnect relay (`wss://relay.walletconnect.org`, `https://*.walletconnect.org`, `https://*.walletconnect.com`, `https://pulse.walletconnect.org`), Coinbase Wallet endpoints; `frame-ancestors 'none'`; HSTS with preload; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- **No third-party scripts** on /app: no analytics, tag managers or remote widgets. Fonts are already self-hosted.
- **Dependencies:** exact versions pinned, `npm ci` from lockfile in builds, Dependabot alerts on, review every wallet-library upgrade by diff. Precedents: the Ledger connect-kit npm takeover (Dec 2023, ~$600k drained) and the chalk/debug npm hijack (Sep 2025, which rewrote wallet addresses).
- **`npm audit` today:** 30 transitive findings (postcss, sharp, ws, zod, hono, uuid), mostly build/server-side DoS. Plan: update Next 15 → 16 and wagmi 2 → 3 / viem latest in a dedicated step with full regression testing.
- **Secrets:** RPC key server-side only (`RPC_URL` secret). Any browser-side key (`NEXT_PUBLIC_RPC_URL`, WalletConnect project ID) gets a domain allowlist in the provider dashboard.
- **Kill switch:** an env flag that disables all writes and shows a banner, flippable in Cloudflare without a code change.

### 3.3 Domain, DNS and accounts (biggest real-world risk)
Front-end hijacks via registrar/DNS are the most common way DeFi users lose funds without any contract bug. Examples: Squarespace (Jul 2024), Curve (2024–2025), Galxe (Oct 2023), and the **Name.com wave on 31 Oct 2026**.

Status of diversifi.tech (15 Nov 2026): registrar Cloudflare ✓, transfer lock ✓, **DNSSEC off ✗, no CAA records ✗**, expires 1 May 2027 (auto-renew must be on).

Actions (we do 2–5 ourselves in Cloudflare and GitHub; item 1 applies to everyone with access, client included):
1. Hardware security keys (passkeys) for every Cloudflare, GitHub and registrar login; remove unused members; least-privilege API tokens.
2. Turn on DNSSEC (one click in Cloudflare) and auto-renew.
3. Add CAA records limiting certificate issuers to the ones Cloudflare uses.
4. Cloudflare notifications for DNS record changes, new members and Workers deploys; certificate-transparency alerts for diversifi.tech.
5. GitHub: branch protection on `main`, 2FA required, secret scanning on.
6. A one-page incident runbook: who to call, how to flip the kill switch, how to post on X.

### 3.4 Compliance (decision for the client)
The DFiUSD Terms and Mint User Agreement say direct mint and redeem with DSI is for **KYC-cleared, whitelisted Mint Users**, **US users are not eligible**, and services use IP geofencing. The contracts themselves are permissionless.

The client must decide what the front end enforces before mint and redeem go live. Until they answer, we build "accept the terms" plus blocking the US and sanctioned countries (Cloudflare tells us each visitor's country), switchable by a setting. The options:
- terms acceptance
- geo-blocking
- wallet sanctions screening (e.g. Chainalysis or TRM)
- a whitelist check

---

## 4. Live data plan

| Data | Source | Where |
|---|---|---|
| Reserve per asset, totals, targets, fees, flags | ReserveManager via multicall on private RPC | server (ISR 60 s, R2 cache), client refresh 60 s |
| Asset list, symbols, decimals | `getTargetAssetParams` + ERC-20 `symbol/decimals` | server; local registry only for colours, issuer names, logos |
| Exact mint/burn amounts | ReserveManagerHelpers `quoteMint/quoteBurn` | client, per input |
| Rebalance result + bonus | `simulateContract(swapTowardsTarget)` | client, per input |
| Swap quotes | V4Quoter `quoteExactInputSingle` | client, per input |
| DFiUSD price / peg history | Uniswap V4 pool state (StateView `getSlot0`) or pool swaps via an indexer | server, cached |
| Wallet activity | Alchemy Transfers API (`alchemy_getAssetTransfers`, free tier) or the DiversiFi subgraph if maintained. Not Etherscan: its free plan is personal-use only and commercial use starts at $299/month. | server route, cached |

Make the coin list dynamic: today `lib/coins.ts` hardcodes seven assets, and governance can change the list.

---

## 5. Build order for the next session(s)

**Goal: every feature live at launch, no "soon" labels.** That means swap, rebalancing, and full-basket mint and redeem, all inside the app.

0. **Prerequisites.** Full list in `CLIENT-CHECKLIST.md`.
   - **We set up ourselves (at the start of the session, guided):**
     - Alchemy key, stored as the `RPC_URL` secret in Cloudflare
     - Reown/WalletConnect project ID, locked to diversifi.tech
     - DNSSEC, CAA, auto-renew, 2FA and Cloudflare notifications
     - PDFs into `public/docs/`
     - check the subgraph owner on The Graph Explorer
     - a small test wallet of our own
   - **Needs the client** (can run in parallel; doesn't block steps 1–4):
     - the mint/redeem gating decision (3.4). Until it comes, build "accept the terms" plus country blocking as the safe default, behind a setting.
     - whether and how they fund the reward pool (an admin/timelock action only they can take)
     - budget for an outside review
1. **Foundation:** contract registry + runtime checks, pinned ABIs from verified sources, chain guard, kill switch, security headers/CSP, dependency upgrade.
2. **Reads:** dynamic asset list, helper quotes, bounty/discrepancy, peg price, activity via indexer.
3. **Writes**, in this order, each with simulate → review → sign → receipt:
   1. **swap** (Universal Router + Permit2, both directions, all seven coins): most users will use this, and it already works on the old site
   2. full-basket mint and redeem
   3. rebalance (swapTowardsTarget)

   When a flow passes its tests, remove its "coming soon" state (`SWAP_LIVE`, the SOON tag, the Uniswap fallback link).
4. **Testing:**
   - unit tests for all maths, checked against helper quotes
   - Anvil mainnet-fork tests for every flow, using impersonated holder accounts
   - Playwright end-to-end tests on the fork with the mock connector
   - Sepolia run
   - small-amount mainnet run with our own test wallet (~$50 stablecoins + ~$10 ETH, mostly returned)
   - an outside review of the transaction-building code before public launch
5. **Launch hardening:** DNS items (3.3), monitoring, runbook, then point diversifi.tech at the new Worker.

---

## 6. Things in the current repo to fix during integration
- `lib/coins.ts`: hardcoded asset list and order. Replace with the on-chain list + registry.
- `components/AppFlow.tsx`: reward is an estimate. Replace with simulation results.
- `lib/abi.ts`: `approve` declared `returns (bool)`, which breaks simulation for USDT.
- `lib/wagmi.ts`: `multiInjectedProviderDiscovery: false` and a MetaMask-only injected target. Enable EIP-6963 so Rabby and other browser wallets appear by name.
- No security headers yet. Add in `middleware.ts`.
- `SWAP_LIVE` false, the SOON tab tag and the "for now, swap on Uniswap" link: all go when swap ships in step 3.
- Dev-only `?preview=` / `?drift=` helpers stay dev-only. Keep them out of production builds (they are gated by `NODE_ENV`).

# DiversiFi web

Next.js (App Router) + TypeScript + viem/wagmi build of the handoff in `../design`.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

## Env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Mainnet RPC (falls back to public endpoints, which may rate-limit or cap log ranges) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect project id; the WalletConnect row is hidden without it |
| `NEXT_PUBLIC_SITE_URL` | Canonical / OG base URL (default `https://diversifi.tech`) |
| `SUBSCRIBE_WEBHOOK_URL` | Where `/api/subscribe` forwards signups; without it the route only validates |

## Layout

- `app/page.tsx`: Home. Server component, ISR every 60s, reads the reserve at render so copy and figures are in the HTML.
- `app/app/page.tsx` + `components/AppFlow.tsx`: mint/redeem flow.
- `components/ReserveBar.tsx`: shared bar (lg/md/sm, live/loading/stale/unavailable).
- `components/ReserveProvider.tsx`: client polling (60s + on focus), stale after 10 min.
- `lib/reserve.ts`: chain reads and largest-remainder rounding. `lib/flow.ts`: mint deposit maths mirroring `ReserveManagerV1.mint`.

## Deviations from the prototype

- **Mint is a basket deposit** (open item 1): the user enters the DFiUSD amount; the app shows the exact amount of each of the seven coins `mint()` will pull (fee added on top via `getCompoundingMintFeeQ96`), requests any missing approvals (USDT is reset to 0 first), then calls `mint`. The home page mint card copy still describes single-coin deposits and needs to be aligned.
- Fees are read from the chain (both are currently 0).
- TOTAL row issuer reads "six issuers"; section 04 H2 has a full stop (open item 5).
- Remaining placeholders are marked `TODO(open item N)` in the code.

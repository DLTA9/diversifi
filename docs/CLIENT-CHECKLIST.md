# Before we connect everything: who does what, and what it costs

Plain-language version. Prices checked 15 Nov 2026; they can change.

---

## Part 1: what WE do ourselves (start of next session, step by step together)

| # | What | Why | Time | Cost |
|---|---|---|---|---|
| 1 | Make an **Alchemy** account and key (alchemy.com), and store it in Cloudflare as a secret called `RPC_URL` | A reliable "phone line" to the blockchain, so live numbers never fail. Also gives each wallet's history. | 5 min | free |
| 2 | Make a **Reown (WalletConnect)** project (cloud.reown.com), lock it to diversifi.tech, put the ID in Cloudflare | Phone wallets can connect with a QR code | 5 min | free |
| 3–5 | **DNSSEC, CAA records, auto-renew** for diversifi.tech | Protects the web address | – | **Moved to launch.** The domain sits in the client's Cloudflare, not ours. See part 2, question E. |
| 6 | Turn on **Cloudflare alerts** for DNS changes, new members and deploys | We hear about anything strange at once | 5 min | free |
| 7 | GitHub: **protect the main branch**, turn on secret scanning and Dependabot alerts | Stops accidental or sneaky changes | 5 min | free |
| 8 | Put the **whitepaper and audit PDFs** into the website itself | Links keep working after the domain moves | 2 min | – |
| 9 | Check whether the old **subgraph** (id DiYPVdygk…) belongs to DiversiFi and still runs, on The Graph Explorer | Decides where charts and history come from | 5 min | free |
| 10 | Our own **test wallet** with about $50 in stablecoins + ~$10 ETH | For the final real-money test; most of it comes back | 10 min | ~$60, mostly returned |

---

## Part 2: client decisions (answered 15 Nov 2026)

| # | Question | Client's answer → what we build |
|---|---|---|
| A | Who may mint, redeem and swap on the website? | **Everyone except US persons.** Show the standard "accept the terms" step, with a line confirming the user is not a US person. No KYC, whitelist or wallet screening. |
| B | Reward pool for rebalancing? | **Rewards will come later; none for now.** The site shows the pool as empty; the reward line appears once it's funded. |
| C | Outside security review? | **No.** We do all checks ourselves: simulation, fork tests, a testnet run and a small mainnet run. |
| D | 2-step login for their team? | **Done.** |
| E | Domain protection (DNSSEC, CAA, auto-renew) | **At go-live**, when the domain moves over. |
| – | Company name on the site? | **No company name** on the website. |
| – | Extra swap fee? | **None.** The old app adds no fee (Uniswap pool fee 0.01% only), so neither do we. |

---

## Part 3: what it costs to run

### Monthly
| Service | Free plan covers | Paid only if | Expected |
|---|---|---|---|
| Cloudflare Workers (hosting) | 100,000 visits/day | busier than that: $5/month | **$0** |
| Cloudflare R2 (page cache) | 10 GB + millions of reads | practically never | **$0** |
| Alchemy (blockchain data) | 30 million units/month | more: $0.52 per extra million | **$0** |
| Reown / WalletConnect | 1 project | extra analytics: $890/year (not needed) | **$0** |
| Etherscan API | not used (free plan is personal-use only; business from $299/month) | – | **$0** |
| Domain diversifi.tech | – | yearly renewal (already paid by them) | as now |

**Total to run: $0 a month**, maybe $5 a month later if the site gets very busy.

### One-time
| What | Cost | Needed? |
|---|---|---|
| USB security keys (YubiKey), 2 per person | ~$50–60 each | strongly recommended |
| Test money | ~$60, mostly returned | yes |
| Outside security review | ~$5,000–$30,000 | declined by the client |
| Sanctions screening service | maybe free (Chainalysis, to confirm) / paid tools thousands per year | only if the client picks option (c) |

No server rent, no database, no paid wallet software.

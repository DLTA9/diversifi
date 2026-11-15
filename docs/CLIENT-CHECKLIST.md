# Before we connect everything: who does what, and what it costs

Plain-language version. Prices checked 15 Nov 2026; they can change.

---

## Part 1: what WE do ourselves (start of next session, step by step together)

| # | What | Why | Time | Cost |
|---|---|---|---|---|
| 1 | Make an **Alchemy** account and key (alchemy.com), and store it in Cloudflare as a secret called `RPC_URL` | A reliable "phone line" to the blockchain, so live numbers never fail. Also gives each wallet's history. | 5 min | free |
| 2 | Make a **Reown (WalletConnect)** project (cloud.reown.com), lock it to diversifi.tech, put the ID in Cloudflare | Phone wallets can connect with a QR code | 5 min | free |
| 3 | Turn on **DNSSEC** for diversifi.tech in Cloudflare | Makes it much harder to hijack the web address | 1 min | free |
| 4 | Add **CAA records** in Cloudflare | Only approved companies can make security certificates for the site | 2 min | free |
| 5 | Check **auto-renew** for the domain (expires 1 May 2027) | Don't lose the address | 1 min | – |
| 6 | Turn on **Cloudflare alerts** for DNS changes, new members and deploys | We hear about anything strange at once | 5 min | free |
| 7 | GitHub: **protect the main branch**, turn on secret scanning and Dependabot alerts | Stops accidental or sneaky changes | 5 min | free |
| 8 | Put the **whitepaper and audit PDFs** into the website itself | Links keep working after the domain moves | 2 min | – |
| 9 | Check whether the old **subgraph** (id DiYPVdygk…) belongs to DiversiFi and still runs, on The Graph Explorer | Decides where charts and history come from | 5 min | free |
| 10 | Our own **test wallet** with about $50 in stablecoins + ~$10 ETH | For the final real-money test; most of it comes back | 10 min | ~$60, mostly returned |

---

## Part 2: what ONLY the client can give us

These don't stop us building; we use a safe default until they answer.

| # | Question for the client | Our default until they answer |
|---|---|---|
| A | **Who is allowed to mint and redeem on the website?** Their own terms say only checked (KYC), approved customers, and nobody from the US. The contract lets anyone. Pick one: (a) "accept the terms" box only, (b) + block the US and sanctioned countries, (c) + check wallets against sanctions lists, (d) only approved wallets. | (b): terms box + country blocking, switchable later |
| B | **Will they put money in the rebalancing reward pool**, how much, and when? Only their admin (the timelock) can do this. | The site shows "pool empty right now" |
| C | **Budget for an outside security review** of the website before launch (roughly $5,000–$30,000) | We still do all our own checks and testing |
| D | Everyone on their side with Cloudflare or GitHub access uses **2-step login, ideally a USB security key** | – |

Nice to confirm, not blocking: the company name to show on the site (their terms say "Diversifi Stables, Inc.") and whether they want their own swap fee on top of Uniswap's 0.01%.

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
| Outside security review | ~$5,000–$30,000 | strongly recommended (client's budget) |
| Sanctions screening service | maybe free (Chainalysis, to confirm) / paid tools thousands per year | only if the client picks option (c) |

No server rent, no database, no paid wallet software.

# Tests

Run from the `web` folder. All three exit with a non-zero code if any check fails.

| Test | What it proves | Needs |
|---|---|---|
| `npx tsx tests/guard.test.ts` | The safety checks switch transactions off for every bad case (fake addresses, migration, unknown coin, wrong decimals, frozen wallet, pause switch). | nothing |
| `npx tsx tests/rebalance.live.test.ts` | `lib/rebalance.ts` matches the live contract: the exact limit is accepted and one unit more is rejected, for every coin in both directions. Reads mainnet; moves no money. | internet |
| `npx tsx tests/reserve.fork.test.ts` | Full-basket mint and redeem, and one-coin rebalancing with a reward, on a private copy of mainnet: exact quoted amounts in and out, reward exactly as predicted, no approvals left over, limits enforced. Acts as governance on the copy only, to move a target and fund a reward pool. | Anvil on :8545 |
| `npx tsx tests/swap.fork.test.ts` | Real swaps of all seven coins in both directions on a private copy of mainnet, using the app's own swap code: exact quote received, no approvals left over, minimum-received and deadline protection, no replay, smart-account route. | Anvil on :8545 (below) |

Start the private copy of mainnet (Foundry's Anvil) with the Alchemy key from `.dev.vars`:

```bash
anvil --fork-url "$(awk '/^RPC_URL=/{print substr($0,9)}' .dev.vars)" --port 8545 --silent
```

To click through the app on that copy with test money: run the dev server and open
`/app?preview=<test wallet>&fork=1`. Both switches only exist in development builds.

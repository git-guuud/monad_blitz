# Blitz Trivia

> Live wagered trivia where answers are cryptographically sealed until the
> buzzer, and answering 300ms faster pays more.

| | |
|---|---|
| **Live app** | **https://quizblitz.tech** |
| **Contract** (Monad Testnet, chain `10143`) | [`0x3b7e9FAcE1FB5De3b4A08414182DEF8c9F8dE5Cd`](https://testnet.monadscan.com/address/0x3b7e9face1fb5de3b4a08414182def8c9f8de5cd) — **source verified** |
| **Repo** | https://github.com/git-guuud/monad_blitz |
| **Screens** | players join at [`quizblitz.tech`](https://quizblitz.tech) · host runs the game at `quizblitz.tech/host?token=<HOST_TOKEN>` |

Also reachable at
[`monad-blitz-lovat.vercel.app`](https://monad-blitz-lovat.vercel.app/) — the
same deployment.

Play it right now: open [quizblitz.tech](https://quizblitz.tech) on a phone,
and open `quizblitz.tech/host?token=<HOST_TOKEN>` on a laptop to run the room.
No wallet extension, no popups — your browser makes a burner and the host funds
it.

---

## Quick start

If the contract above is still deployed, you only need the frontend. Five
commands, about three minutes:

```bash
git clone <this repo> && cd monad_blitz/web
pnpm install
cp .env.example .env.local          # then fill in the three values below
pnpm build
pnpm start                          # http://localhost:3000
```

Filling in `web/.env.local`:

```bash
# 1. A funded Monad testnet key. Generate one:
cd ../contracts && cast wallet new
#    Fund the address it prints at https://faucet.monad.xyz

# 2. Generate the other two secrets:
openssl rand -hex 32                # -> HOST_SECRET
openssl rand -hex 12                # -> HOST_TOKEN
```

| Variable | What it is |
|---|---|
| `HOST_PRIVATE_KEY` | Funded testnet key. Runs the game **and** drips gas into every player's burner wallet. Burner key only — never a wallet holding real funds. |
| `HOST_SECRET` | Seeds the host's answer salts. Any long random string. Changing it after a quiz is created makes that quiz's answers permanently unrevealable. |
| `HOST_TOKEN` | Guards `/api/host/*` so nobody in the room can finalize the round on you. |

Then **[run a game](#run-a-game)**.

> **Use `pnpm build && pnpm start`, not `pnpm dev`, for anything you care about.**
> `next dev` compiles each API route on its first request, which can take tens of
> seconds — long enough for a whole 10-second commit window to expire before
> anyone can answer.

---

## Run a game

You need two browser windows: the **host** screen (a projector, in the real
thing) and at least one **player** screen (a phone).

1. **Open the host screen** at `http://localhost:3000/host?token=<HOST_TOKEN>`.
   The token is remembered after the first visit, so later you can just open
   `/host`.

2. **Press "New quiz".** This is the important beat: the host seals all five
   answers on chain *now*, before anyone has joined, so it cannot pick the
   correct answer later after seeing what the room guessed. The screen switches
   to a lobby showing a join QR code.

3. **Players open `/`** (scan the QR, or type the URL) and press **Join**. Each
   player's browser generates a burner wallet, the host funds it automatically,
   and it pays the 0.005 MON entry fee into the pot. No wallet extension, no
   popups — two transactions per question per player would make popups
   unplayable.

   Wait until everyone is in. Joining closes the moment question 1 starts.

4. **Press "Run round".** The host screen now drives itself off block deadlines:
   start question → wait out the commit window → reveal the answer → next
   question → finalize. Do not click anything else.

5. **Players just tap an answer.** Their client seals it, and re-opens it
   automatically when the buzzer goes. Nothing else to press.

6. **When the round ends,** each player gets a **Claim** button for their share
   of the pot.

### What to watch on the host screen

- During `COMMIT`, the live feed shows every answer landing on chain as an
  **opaque hash**. Nobody can read one — not the other players, not the host,
  not the mempool. This is the whole pitch.
- During `REVEAL`, the same players reappear with their actual answers and
  points, checked against the hash they committed.
- Two players who both answered correctly score **differently**, because their
  commits landed in different blocks.

### Timing

| Phase | Length | What happens |
|---|---|---|
| `COMMIT` | 25 blocks (~10s) | Players submit a sealed hash of their answer |
| `REVEAL` | 25 blocks (~10s) | Host opens its answer; players open theirs |
| `SCORED` | — | Totals fixed, next question starts |

Every deadline is a **block number**, never a wall clock, so the countdown on
screen can never disagree with the contract. A five-question round takes about
100 seconds.

---

## Verify it actually works

```bash
cd web
pnpm build && pnpm start &          # the script talks to a running server
node scripts/e2e.mjs                # run from web/, it reads ./.env.local
```

Plays a complete round on live testnet with three burner wallets and asserts the
result. It reads the contract address from `src/lib/contract.ts`, so it always
targets whatever you last deployed. Takes ~3 minutes and costs the host key
about 0.55 MON.

- **alice** answers instantly and correctly
- **bob** answers correctly but ten blocks later
- **mallory** copies alice's commitment hash verbatim off the chain

Expected output:

```
mallory could NOT open the copied commitment (bound to msg.sender)
scores → alice 168 · bob 120 · mallory 0
pot 0.015 · prizePool 0.01425 · totalScore 568
alice owed 0.008128521126760563 · bob owed 0.006121478873239436
paid out 0.014249999999999999 · contract holds ... (rake + dust)
E2E PASSED
```

Alice and bob both got the answer right; alice scores more purely because she
was faster. Mallory's copied commitment is worthless. Payouts sum to the prize
pool exactly.

The contract test suite runs offline:

```bash
cd contracts && forge test        # 19 tests
```

---

## Build and deploy the contract yourself

Only needed if you are changing the contract. Requires
[Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
cd contracts
cp .env.example .env
#   PRIVATE_KEY        same key as web/.env.local's HOST_PRIVATE_KEY
#   ETHERSCAN_API_KEY  free from https://etherscan.io/apis (used for verification)

make wallet                 # generate a fresh key, if you need one
make balance                # check it has faucet MON
make build
make test                   # 19 tests

make deploy-testnet CONTRACT=BlitzTrivia
make verify-testnet ADDR=0x... CONTRACT=BlitzTrivia
make abi                    # regenerate web/src/lib/contract.ts from the artifact
```

`make abi` rewrites the ABI but **not** the address — paste the address printed
by `deploy-testnet` into `web/src/lib/contract.ts` and into the top of this
README.

---

## Hosting it publicly

Deploy the `web/` directory to Vercel. Set the same three environment variables
in the project's dashboard — `HOST_PRIVATE_KEY`, `HOST_SECRET`, `HOST_TOKEN` —
and paste the resulting URL at the top of this README. Nothing else is needed:
no second service, no worker, no cron.

That is worth a note, because the round is driven by a **loop that has to keep
running for ~90 seconds** after the host presses Run round, and serverless is
not the obvious place for one.

- The driver runs inside [`after()`](https://nextjs.org/docs/app/api-reference/functions/after),
  so `POST /api/host/run` answers in about 250ms and the loop keeps going past
  the response. `maxDuration = 300` in that route covers a measured 86-second
  five-question round; 300s is Hobby's default *and* its ceiling, so the free
  plan is enough.
- **Nothing is held in memory between requests.** Every decision the driver
  makes is read from the chain, which makes it idempotent and resumable: if an
  invocation is cut short, pressing Run round again reads where the round
  actually is and continues from there. Verified by killing the process
  mid-round — a fresh one picked it up at question 5 and settled it.
- Status is chain-derived for the same reason. A flag in memory would report
  "idle" for a round running fine on another instance.

There is deliberately no Stop button: the driver is a one-shot that ends at
settlement, and on serverless there is no shared process to send a stop signal
to. Pressing Run round again is safe, and is also how you recover a stall.

### The one thing to watch

`/api/fund` allocates nonces from a per-process counter, and on serverless
concurrent requests can land on separate instances that each hand out the same
one — realistically, a lobby where several people tap Join in the same second.
The collision is detected and retried, and the retry re-checks the burner's
balance first so it can never pay a player twice, but a busy lobby will be
slower than it looks. A shared counter in Vercel KV is the fix if that ever
bites.

### Cost

The host key funds every player, so **host MON is what caps the size of a round**:

| Questions | Gas per player | Funding per player | Host gas per round | Players per 5 MON |
|---|---|---|---|---|
| 5 (default) | ~1.58M | 0.240 MON | ~0.25 MON | ~20 |
| 3 | ~1.07M | 0.175 MON | ~0.17 MON | ~27 |

Funding is derived from the gas budget in
[`quiz-config.ts`](web/src/lib/quiz-config.ts) rather than hardcoded, so
changing the round length re-sizes the drip automatically. Set
`NEXT_PUBLIC_QUESTION_COUNT=3` to shorten the round if the host key is thin.
Top up at [faucet.monad.xyz](https://faucet.monad.xyz) **before** the room
arrives; `make balance` in `contracts/` reads the same key.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Player screen says "No quiz on chain yet" | Nobody has pressed **New quiz** on the host screen. |
| **Join** is disabled, "Round already started" | Joining closes when question 1 starts. Press **New quiz** for a fresh round. |
| Host screen shows `bad host token` | Wrong or missing `HOST_TOKEN`. Reopen as `/host?token=<HOST_TOKEN>`. |
| `HOST_TOKEN is not set on the server` | You edited `.env.local` but did not restart. Next reads it at boot — rebuild and restart. |
| Funding fails, `transfer reverted` | The host key is out of MON. Check with `make balance` in `contracts/`. |
| A question flies past before anyone can answer | You are running `pnpm dev`. Use `pnpm build && pnpm start`. |
| Players see the question late, or reveals fail | The public RPC is struggling. Everything retries with backoff, but a paid RPC endpoint is worth it for a big room. |
| `e2e.mjs` fails at `fund:` | The server is not running, or `HOST_TOKEN` in `.env.local` does not match the running server. |

---

## How it works

### The problem

You cannot build a quiz on a public blockchain naively. Submit your answer as a
transaction and it sits in a public mempool where anyone can read it and copy it
before the block seals. Every naive on-chain trivia app is trivially cheatable.

The fix is **commit–reveal**, and it has been unusable for consumer games because
it needs two rounds. On Ethereum that is ~24 seconds of dead air per question —
nobody will play that. At 400ms blocks both phases finish faster than a human
notices.

HQ Trivia peaked above a million concurrent players and died of payment
infrastructure — it could not send millions of tiny prize payouts affordably or
quickly. Sub-cent instant settlement is exactly that problem, solved.

### The attack this defends against

The commitment binds to `msg.sender`:

```solidity
commitment = keccak256(abi.encodePacked(quizId, questionIndex, answer, salt, msg.sender))
```

All five fields matter. Without `msg.sender`, an attacker could watch your commit
transaction, submit the identical hash, wait for you to reveal, and replay your
reveal — you would have done their thinking for them. `quizId` and
`questionIndex` stop replay across rounds.

This is the first test in the suite
([`test_copiedCommitmentCannotBeRevealed`](contracts/test/BlitzTrivia.t.sol)):
Mallory copies Alice's commitment verbatim, the contract accepts it, and it is
worthless.

The host's answers are sealed the same way at `createQuiz`, before anyone joins.
The host is still trusted to *write* the questions — a deliberate, stated
limitation, and verifiable after the fact.

### Scoring and payout

Speed is scored in blocks, which is only meaningful at sub-second block times:

```
elapsed   = commitBlock - startBlock
remaining = commitBlocks - min(elapsed, commitBlocks)
points   += BASE + (SPEED_BONUS * remaining / commitBlocks)     // 100 + up to 100
```

Points are fixed by the **commit** block, not the reveal block — the commit is
when you actually answered. Payout is pari-mutuel, so the contract cannot go
insolvent mid-demo:

```
prizePool = pot - (pot * 500 / 10000)            // 5% house rake
payout(p) = prizePool * score[p] / totalScore    // totalScore == 0 → full refund
```

Withdrawals are pull-based (`claim()`), never a loop over players — paying 40
players in one transaction is an unbounded loop and a gas hazard.

### Design notes

- **Reveal order does not matter.** Player reveals accumulate into a per-choice
  bucket, so the host reveal settles the question total in O(1) whether it lands
  before or after the players. Nothing deadlocks on a slow host.
- **Auto-reveal.** The client opens the player's commitment the moment the commit
  window closes. Waiting for a human to press a second button is how players end
  up scoring zero on answers they got right.
- **Salts survive a refresh.** The salt is written to `localStorage` before the
  commit transaction is sent; a reload mid-question would otherwise make the
  player's own commitment unopenable.
- **Host answers never reach the browser.** Salts are derived server-side from
  `HOST_SECRET`, and the client is served prompts and choices only.

### What the chain taught us

- **Monad charges the full gas *limit*, not gas used.** Every player limit in
  [`quiz-config.ts`](web/src/lib/quiz-config.ts) is a measured cost plus a small
  margin. An over-generous limit is money burned — a 250k limit on a 140k
  transaction costs 0.011 MON extra, every time.
- **An estimate is not a safe limit.** `revealHostAnswer` estimated 125,577 gas,
  used exactly that, and died: the estimate ran before the players revealed, and
  once a reveal bucket is non-zero, `totalScore` takes a cold `SSTORE` the
  estimate never saw. Host limits are set explicitly and loosely.
- **`claim` gas grows with the length of the round.** It walks every question to
  total the score — ~155k at five questions against ~95k for a commit — so it is
  derived from the question count rather than hardcoded.
- **A funded burner is not immediately spendable.** Monad validates new
  transactions against settled state, so a wallet funded in block N is still
  rejected as "insufficient balance" for roughly eight blocks (~3s). The funding
  endpoint waits for confirmations before telling the player they can join.
- **An accepted transaction can still revert.** `eth_sendRawTransaction` does not
  simulate execution, so an unchecked hash is indistinguishable from a lost
  answer. Every write checks its receipt status.
- **RPC nodes sit a block or two apart.** A transaction sent on a phase boundary
  can be judged against the previous phase. Retried with backoff rather than
  surfaced as an error.

---

## Layout

| Path | What |
|---|---|
| `contracts/src/BlitzTrivia.sol` | The contract |
| `contracts/test/BlitzTrivia.t.sol` | 19 tests, including the copy-commit attack |
| `web/src/app/page.tsx` | Player screen |
| `web/src/app/host/page.tsx` | Host projector screen — live commit feed, leaderboard |
| `web/src/app/api/host/*` | Host control plane, signed server-side |
| `web/src/lib/round-runner.server.ts` | Drives the round; stateless and resumable |
| `web/src/app/api/fund/route.ts` | Burner funding drip |
| `web/src/lib/quiz-config.ts` | Timings, entry fee, gas limits, round length |
| `web/src/lib/questions.server.ts` | The questions **and answers** — server-only |
| `web/scripts/e2e.mjs` | Full round against live testnet, attack included |

## Requirements

| | |
|---|---|
| Node | 20+ (developed on 25) |
| pnpm | 11+ |
| Foundry | only to rebuild the contract |

## Networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | `10143` | `143` |
| RPC | `https://testnet-rpc.monad.xyz` | `https://rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` | `https://monadscan.com` |
| Faucet | `https://faucet.monad.xyz` | — |

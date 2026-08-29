# Blitz Trivia — front-running-resistant live wagered trivia

> **This is a planning document.** Rules require all coding to start at 11:30 AM.
> Nothing here is implementation — it's decisions made in advance so you write
> code, not design, at the bell. See [RUBRIC.md](./RUBRIC.md) for scoring.

---

## The pitch (say this, in this order)

1. **You cannot build a quiz on a public blockchain naively.** Submit your answer as a
   transaction and it sits in a public mempool where anyone can read it and copy it
   before the block seals. Every naive on-chain trivia app is trivially cheatable.
2. **The fix is commit–reveal**, and it's been unusable for consumer games because it
   needs two rounds. On Ethereum that's ~24 seconds of dead air per question — nobody
   will play that. **At 400ms blocks both phases finish faster than a human notices.**
3. **HQ Trivia peaked at over a million concurrent players and died of payment
   infrastructure** — it could not send millions of tiny prize payouts affordably or
   quickly. Sub-cent instant settlement is exactly that problem, solved.
4. Revenue: house rake on entry fees; creator-run paid quizzes.

**One-liner:** *Live wagered trivia where answers are cryptographically sealed until
the buzzer, and answering 300ms faster pays more.*

---

## Locked design decisions

Do not relitigate these tomorrow. They were decided tonight so you don't burn build time.

| Decision | Choice | Why |
|---|---|---|
| Answer secrecy | Commit–reveal, both sides | Contract storage is world-readable |
| Host answers | Committed up front, revealed per question | Stops the host picking answers after seeing commits |
| Scoring | Base + speed bonus, decays per **block** | Only meaningful with sub-second blocks |
| Which block counts | The **commit** block, not reveal | Commit is when you actually answered |
| Pot | **Pari-mutuel** — share of pot ∝ share of score | Cannot go insolvent mid-demo |
| No-show on reveal | Score 0, round advances anyway | Never let one dropped phone deadlock the game |
| Round advance | On block deadline, never on "all players done" | Same reason |
| Wallets | Burner key in localStorage, pre-funded by host | 2 tx per question per player — popups would kill it |
| Questions | Hardcode 5 for the demo | Scope |

### The attack you must defend against (and the one that's easy to miss)

The commitment **must bind to `msg.sender`**. If it's just `hash(answer, salt)`, then I
can watch your commit transaction, submit the identical hash myself, wait for you to
reveal, and replay your reveal. You'd have done my thinking for me.

```
commitment = keccak256(abi.encodePacked(quizId, questionIndex, answer, salt, msg.sender))
```

All five fields matter. `quizId` and `questionIndex` stop replay across rounds.

---

## Contract shape

Interface only — write the bodies tomorrow.

```solidity
// Phases per question, all deadline-driven by block number:
//   COMMIT  (~25 blocks ≈ 10s)  players submit sealed answers
//   REVEAL  (~25 blocks ≈ 10s)  host reveals correct answer; players open theirs
//   SCORED                      totals fixed, next question starts

function createQuiz(bytes32[] answerCommitments, uint256 entryFee, uint32 commitBlocks, uint32 revealBlocks) external returns (uint256 quizId);
function join(uint256 quizId) external payable;              // pays entryFee into the pot
function startQuestion(uint256 quizId, uint8 q) external;     // host; stamps startBlock
function commitAnswer(uint256 quizId, uint8 q, bytes32 commitment) external;
function revealHostAnswer(uint256 quizId, uint8 q, uint8 answer, bytes32 hostSalt) external;
function revealAnswer(uint256 quizId, uint8 q, uint8 answer, bytes32 salt) external;
function finalize(uint256 quizId) external;                   // locks totalScore
function claim(uint256 quizId) external;                      // pull, never push
```

**Payout, integer-safe and solvent by construction:**

```
pot        = entryFee * playerCount
prizePool  = pot - (pot * rakeBps / 10000)      // rakeBps = 500 → 5% house rake
payout(p)  = prizePool * score[p] / totalScore  // if totalScore == 0, refund entry fees
```

**Speed-weighted score, integer math, no floats:**

```
elapsed   = commitBlock - startBlock            // in blocks
remaining = commitBlocks - min(elapsed, commitBlocks)
score    += BASE + (SPEED_BONUS * remaining / commitBlocks)   // e.g. BASE=100, SPEED_BONUS=100
```

Awarded only if the reveal hashes back to the commitment **and** matches the host's
revealed answer. Wrong answers score 0 but still paid the entry fee — that's the game.

**Use `claim()`, never loop payouts.** Paying 40 players in one transaction is an
unbounded loop and a gas hazard. Pull-based withdrawal is safer and it's more
transactions on chain, which the rubric rewards.

---

## Build order — 11:30 to 17:30

Two people on the critical path, one on media from 15:30. Adjust if you're a pair.

| Time | Who | What |
|---|---|---|
| 11:30–11:45 | all | Repo: `git init`, push empty. Agree params. **Do not redesign.** |
| 11:45–12:45 | A | Contract v1: one question, commit/reveal, no money. Forge tests for the copy-commit attack. |
| 11:45–12:45 | B | Burner wallet in localStorage + auto-funding from host key. **This is the real blocker.** |
| 12:45–13:30 | A | Add pot, scoring, `claim()`. Tests green. |
| 12:45–13:30 | B | Player screen: join, question, 4 buttons, countdown. |
| 13:30–14:00 | — | Lunch, staggered — someone keeps moving |
| 14:00–14:45 | A | Deploy testnet → paste address into `web/src/lib/contract.ts` + README → **verify (25 pts)** |
| 14:00–14:45 | B | Host screen: projector view, live commit feed, leaderboard |
| 14:45–15:15 | all | Wire end to end. First full round played internally. |
| **15:15–15:45** | all | **Play a live round with the room.** Test + 25 pts for 10+ external users + video footage, all at once. |
| 15:45–16:30 | C/B | Demo video (30s+), ad video, X + LinkedIn posts tagging **@monad @monad_dev @geeky_kartikey** |
| 15:45–16:30 | A | Mainnet deploy (25 pts) + custom domain (15 pts) |
| 16:30–17:00 | all | README: live URL, contract address, run-from-scratch steps (25 pts) |
| 17:00–17:30 | all | Rehearse demo twice against a timer. Record fallback video. |
| **17:30** | | **Code freeze** — submit by 17:45 |

### Cut list, in the order you cut

1. Leaderboard animation
2. Multiple concurrent quizzes → hardcode one
3. Questions 5 → 3
4. Mainnet deploy and custom domain (40 bonus pts, drop before dropping anything above)
5. Pari-mutuel → winner-takes-all

**Never cut:** contract verification, the live round with the room, the social posts.
Those are 75 points that cost under an hour combined, and most teams will skip all three.

---

## The 3-minute demo

Rehearsed twice, against a timer.

| Time | Beat |
|---|---|
| 0:00–0:20 | "You can't build a quiz on chain naively." Show the host screen: pending commits are **opaque hashes**. Nobody can see an answer. |
| 0:20–0:35 | "Commit–reveal fixes it, but needs two rounds. On Ethereum that's 24 seconds of dead air. Here it's under a second." |
| 0:35–2:00 | **Play a live round with the audience.** Transactions stream on the projector. Reveal. Leaderboard. Pot splits. |
| 2:00–2:30 | Speed bonus: show two correct answers scoring differently because they landed in different blocks. |
| 2:30–3:00 | HQ Trivia line + revenue. Say the four eligibility items out loud: **repo, contract address, live URL, deployment.** |

Fallback if the network misbehaves: pre-recorded video, ready to play, no apologies.

---

## Known risks

- **Reveal participation.** Players who close the tab never reveal and score 0. Auto-reveal
  from the client the moment the commit window closes; don't rely on a human clicking.
- **Burner funding.** 40 players × 2 tx × 5 questions ≈ 400 transactions. Cheap, but the
  host key must have faucet MON and hand out enough per player. Test the drip early.
- **Clock skew.** Drive every countdown from `block.number`, never `Date.now()`, or the UI
  will disagree with the contract at exactly the wrong moment.
- **Host is a trusted party.** It commits answers up front, which is verifiable after the
  fact. Say this out loud before a judge asks — owning it reads as rigour.

## Network reference

Testnet `10143` · `https://testnet-rpc.monad.xyz` · explorer `https://testnet.monadscan.com`
Mainnet `143` · `https://rpc.monad.xyz` · explorer `https://monadscan.com`
Faucet `https://faucet.monad.xyz` · deploy/verify targets in `contracts/Makefile`

# Monad Blitz New Delhi V4 — Scoring Checklist

**Sat 29 Aug 2026 · 9 AM–9 PM · 91Springboard, Plot D-107, Vyapar Marg, Sector 2, Noida 201301**

Total: **400 points**. No peer voting. 340 pts are a mechanical checklist; only 60 are subjective.
Everything locks at **5:45 PM**. Anything posted after that earns nothing.

---

## Timeline

| Time | What |
|---|---|
| 9:00–9:45 | Registration & breakfast |
| 9:45–10:15 | Welcome & Monad 101 |
| 10:15–11:15 | Build with AI & Monskills |
| 11:15–11:30 | Team building |
| **11:30** | **Hack starts — first line of code allowed here** |
| 13:00–14:00 | Lunch |
| **17:30** | **Code freeze** |
| **17:45** | **Submission deadline (hard lock)** |
| 18:00–20:30 | Demos, 3 min each |
| 20:30–20:50 | Judging deliberation |
| 20:50–21:00 | Awards |

Actual build window: **6 hours**. Suggested split — 3.5h code · 1h media · 0.5h deploy/verify/domain · 1h buffer.

---

## Basic — 100 pts (eligibility gate; without these you cannot win)

- [ ] **25** — Public GitHub repo
- [ ] **25** — Proper README containing **live public URL** + **contract address**
- [ ] **25** — Smart contracts deployed on Monad Testnet
- [ ] **25** — Project publicly hosted (any host; custom domain not needed here)

> Say all four out loud during the pitch: repo link, contract address, live URL, deployment.

## Advance — 200 pts (this is where the win is decided)

### Project Working — 100
- [ ] **25** — Every function you announced actually works
- [ ] **25** — A **live transaction lands on chain during the demo**
- [ ] **25** — Contract **verified on the explorer** (source published) ← most-forgotten 25 pts
- [ ] **25** — A stranger can run it from the README with no help from you

### Build in Public — 100
- [ ] **25** — Post on X / LinkedIn tagging **@monad**, **@monad_dev**, **@geeky_kartikey**
- [ ] **25** — Demo video posted on socials (30 sec+, product actually running)
- [ ] **25** — A creative *ad* video for the product posted on socials
- [ ] **25** — 5K+ collective views across all Blitz posts

> **Escape hatch for the views line** (pick either, needs screenshot + live link):
> - 25+ waitlist signups, **or**
> - **10+ people outside your team used it on the day** ← easiest at a 70-person venue

## Bonus — 100 pts

- [ ] **25** — Contracts also deployed on Monad **Mainnet** *(organizers verify)*
- [ ] **15** — Public page on a **custom domain** *(organizers verify)*
- [ ] **≤20** — PMF *(judges)*
- [ ] **≤20** — Revenue potential & strategy *(judges)*
- [ ] **≤20** — Innovation & originality *(judges)*

---

## Rules that can disqualify you

- [ ] Team ≤ **3** people
- [ ] **Fresh idea only** — no pre-built projects, no forking an existing codebase beyond standard libs/boilerplate
- [ ] **No code before 11:30 AM.** Research and planning beforehand is fine and encouraged
- [ ] No straight clones — needs a real twist or a Monad-specific mechanic
- [ ] Submitted via a **forked repo** per the submission page, and deployed + operational on Testnet or Mainnet
- [ ] Hosted on the web (Vercel or similar)

## Submission steps

1. Public repo with README, named, one-line description
2. Push code during hackathon hours (commit history should show it)
3. On the event page, wait for **Submit Project** to become clickable
4. Fill GitHub URL + Demo URL (hosted page)
5. Submit. Editable until voting opens — **not** after 5:45 PM

---

## Network reference

| | |
|---|---|
| Testnet chain ID | `10143` |
| Testnet RPC | `https://testnet-rpc.monad.xyz` |
| Testnet explorer | `https://testnet.monadscan.com` |
| Faucet | `https://faucet.monad.xyz` |
| Testnet hub | `https://testnet.monad.xyz` |
| Docs | `https://docs.monad.xyz` |
| Native token | MON |
| **Mainnet** chain ID | `143` (bonus 25 pts) |
| Mainnet RPC | `https://rpc.monad.xyz` |
| Mainnet explorer | `https://monadscan.com` |

Useful: Monad supports **P256 verification natively at precompile `0x0100`** (EIP-7951, 6900 gas) — passkey signature checks with no verifier library. See `docs.monad.xyz/developer-essentials/precompiles`.

All RPC/explorer endpoints above were probed and confirmed live on 28 Aug 2026.
Note: the dev-portal's `rpc.testnet.monad.xyz` does **not** resolve — use `testnet-rpc.monad.xyz`.

Verification (the 25 pts everyone forgets) goes through the Etherscan V2 multichain API,
which supports chainid 10143. Get a free key at etherscan.io/apis and set `ETHERSCAN_API_KEY`.
From `contracts/` the Makefile wraps this — `make deploy-testnet` then `make verify-testnet ADDR=0x...`

---

## Demo — 3 minutes

- [ ] Rehearsed against a timer at least twice
- [ ] Opens with the live product, not slides (slides optional, minimal, visual)
- [ ] Live on-chain transaction happens on screen
- [ ] Covers: what it is · why it's novel · which Monad features you used
- [ ] Names repo / contract address / live URL out loud
- [ ] Fallback ready: screenshots + a recorded video if the demo breaks

Audience is fellow developers, not VCs — lead with the mechanic and the wow factor.

## Final sweep before 5:45 PM

- [ ] README has live URL + contract address
- [ ] Contract verified on explorer
- [ ] Mainnet deploy done
- [ ] Custom domain pointed
- [ ] All three social posts up and tagged
- [ ] Screenshot of views / signups / in-room users captured
- [ ] Project submitted on the portal

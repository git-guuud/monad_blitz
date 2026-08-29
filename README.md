# Monad Blitz New Delhi V4

> Live wagered trivia where answers are cryptographically sealed until the
> buzzer, and answering 300ms faster pays more.

**Live:** _paste hosted URL_
**Contract (Monad Testnet):** `0x...`
**Explorer:** https://testnet.monadscan.com/address/0x...

Build spec: [IDEA.md](./IDEA.md) · Scoring checklist: [RUBRIC.md](./RUBRIC.md)

## Layout

| Path | What |
|---|---|
| `contracts/` | Foundry — Solidity, tests, deploy + verify targets |
| `web/` | Next.js 16 + wagmi v3 + viem, preconfigured for Monad |
| `RUBRIC.md` | Judging checklist, timings, network reference |

## Quickstart

```bash
# 1. contracts
cd contracts
cp .env.example .env      # then: make wallet, and paste the key in
make balance              # top up at https://faucet.monad.xyz
make build && make test
make deploy-testnet CONTRACT=Counter
make verify-testnet ADDR=0x... CONTRACT=Counter   # 25 rubric points

# 2. frontend — paste the address into web/src/lib/contract.ts
cd ../web
pnpm dev
```

The homepage is a live smoke test: connect a wallet, read contract state, send a
transaction, and see the confirmation latency and an explorer link.

## Networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | `10143` | `143` |
| RPC | `https://testnet-rpc.monad.xyz` | `https://rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` | `https://monadscan.com` |
| Faucet | `https://faucet.monad.xyz` | — |

Deploy to mainnet too — it's worth 25 bonus points.

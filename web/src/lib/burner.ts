"use client";

import {createWalletClient, type Hex} from "viem";
import {privateKeyToAccount, generatePrivateKey} from "viem/accounts";
import {activeChain, publicClient, transport} from "./chain";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "./contract";

const KEY = "blitz.burner.key";

/// A burner key in localStorage, pre-funded by the host. Two transactions per
/// question per player — a wallet popup on each one would kill the game.
export function loadBurnerKey(): Hex {
  let key = localStorage.getItem(KEY) as Hex | null;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    key = generatePrivateKey();
    localStorage.setItem(KEY, key);
  }
  return key;
}

export function burnerAccount() {
  return privateKeyToAccount(loadBurnerKey());
}

export function burnerWallet() {
  return createWalletClient({
    account: burnerAccount(),
    chain: activeChain,
    transport: transport(),
  });
}

/// Errors that mean "the node I reached is a block or two behind", not "this is
/// wrong". A funded burner looks unfunded to a lagging node, and a transaction
/// sent on a phase boundary is judged against the previous phase. Both resolve
/// themselves within a block or two.
function isTransient(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return (
    /insufficient balance/i.test(m) ||
    /WrongPhase/.test(m) ||
    /nonce/i.test(m) ||
    /timed out|timeout/i.test(m)
  );
}

type Fees = {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint};

/// Everything viem would otherwise have to fetch *between the tap and the
/// signature*. Left to itself it reads the nonce and estimates fees first — two
/// round trips, about 600ms on the public RPC. At 400ms blocks that is a block
/// or two of score handed to network latency, on the one mechanic where the
/// whole point is that answering faster pays more. So they are kept warm and
/// passed in explicitly, and signing happens immediately on the tap.
let fees: {value: Fees; at: number} | null = null;
let nonce: number | null = null;

/// Fees are re-read often enough to track a moving base fee, but a stale figure
/// is survivable — it is a *max*, not a price.
const FEES_TTL_MS = 8_000;

export async function warmBurner() {
  const address = burnerAccount().address;
  const [f, n] = await Promise.all([
    publicClient.estimateFeesPerGas(),
    publicClient.getTransactionCount({address, blockTag: "pending"}),
  ]);
  fees = {
    value: {maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas},
    at: Date.now(),
  };
  // never walk the counter backwards: `pending` can lag a transaction we have
  // already broadcast, and reusing its nonce would replace our own commit
  if (nonce === null || n > nonce) nonce = n;
}

async function prepared(): Promise<{fees: Fees; nonce: number}> {
  if (!fees || nonce === null || Date.now() - fees.at > FEES_TTL_MS) {
    await warmBurner();
  }
  return {fees: fees!.value, nonce: nonce!};
}

/// Sends and confirms one game transaction. Monad accepts transactions that
/// later revert on chain, so an unchecked hash is indistinguishable from a lost
/// answer — always check the receipt status.
export async function sendBurnerTx(
  call: {functionName: string; args: readonly unknown[]; value?: bigint; gas: bigint},
  attempts = 5,
): Promise<Hex> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const ready = await prepared();
      // claim the nonce before awaiting the send, so a reveal firing while a
      // commit is still in flight cannot be handed the same one
      nonce = ready.nonce + 1;
      const hash = await burnerWallet().writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        chain: activeChain,
        nonce: ready.nonce,
        maxFeePerGas: ready.fees.maxFeePerGas,
        maxPriorityFeePerGas: ready.fees.maxPriorityFeePerGas,
        ...call,
      } as never);
      const receipt = await publicClient.waitForTransactionReceipt({hash});
      if (receipt.status !== "success") throw new Error("transaction reverted on chain");
      return hash;
    } catch (e) {
      last = e;
      // the local counter may now be ahead of the chain; re-read it next time
      nonce = null;
      if (!isTransient(e) || i === attempts - 1) throw e;
      // back off: a lagging node can be a couple of seconds behind, and a flat
      // short retry just burns all the attempts inside that window
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

/// The salt has to survive a refresh, or a reload mid-question would make the
/// player's own commitment unopenable and silently score them zero.
type Sealed = {answer: number; salt: Hex};

function sealKey(quizId: number, q: number) {
  return `blitz.sealed.${quizId}.${q}`;
}

export function saveSealed(quizId: number, q: number, sealed: Sealed) {
  localStorage.setItem(sealKey(quizId, q), JSON.stringify(sealed));
}

export function loadSealed(quizId: number, q: number): Sealed | null {
  // called during render, which also runs on the server for the initial HTML
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(sealKey(quizId, q));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Sealed;
  } catch {
    return null;
  }
}

export function clearSealed(quizId: number, q: number) {
  localStorage.removeItem(sealKey(quizId, q));
}

export function randomSalt(): Hex {
  return generatePrivateKey();
}

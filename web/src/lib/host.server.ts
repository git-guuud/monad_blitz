import "server-only";
import {
  createWalletClient,
  formatEther,
  keccak256,
  encodePacked,
  type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {activeChain, publicClient, transport} from "./chain";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "./contract";
import {HOST_GAS} from "./quiz-config";

function hostKey(): Hex {
  const key = process.env.HOST_PRIVATE_KEY;
  if (!key) throw new Error("HOST_PRIVATE_KEY is not set — see web/.env.example");
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export function hostAccount() {
  return privateKeyToAccount(hostKey());
}

export function hostWallet() {
  return createWalletClient({
    account: hostAccount(),
    chain: activeChain,
    transport: transport(),
  });
}

/// Host salts are derived, never stored, and never leave the server. Keeping them
/// out of the client bundle is the difference between "the answers are sealed"
/// and "the answers are sealed unless you open devtools".
export function hostSalt(quizId: number, q: number): Hex {
  const secret = process.env.HOST_SECRET;
  if (!secret) throw new Error("HOST_SECRET is not set — see web/.env.example");
  return keccak256(
    encodePacked(["string", "uint256", "uint8"], [secret, BigInt(quizId), q]),
  );
}

export function hostCommitment(quizId: number, q: number, answer: number): Hex {
  return keccak256(
    encodePacked(
      ["uint256", "uint8", "uint8", "bytes32", "address"],
      [BigInt(quizId), q, answer, hostSalt(quizId, q), hostAccount().address],
    ),
  );
}

/// Every host transaction — quiz control and burner funding alike — goes out from
/// one key, so they are serialised.
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/// Nonces are handed out locally, not read from the RPC per send. `pending` lags
/// behind what we have already broadcast, so two funding requests a few hundred
/// milliseconds apart would both be told nonce N — the second silently replaces
/// the first, and one player is left unfunded holding a confirmed receipt for
/// somebody else's transfer.
///
/// This counter is per-process, which is exactly as far as the guarantee goes.
/// On serverless, concurrent requests can land on separate instances that each
/// hold their own copy and hand out the same nonce — the realistic case being a
/// lobby where several people tap Join in the same second. There is no shared
/// lock to fix that without a shared store, so instead the collision is made
/// *survivable*: it is detected, the counter is resynced, and the send is
/// retried. See `isNonceCollision`.
let nextNonce: number | null = null;

async function reserveNonce(): Promise<number> {
  return serialize(async () => {
    if (nextNonce === null) {
      nextNonce = await publicClient.getTransactionCount({
        address: hostAccount().address,
        blockTag: "pending",
      });
    }
    return nextNonce++;
  });
}

/// Called whenever a send fails: the local counter may now be ahead of the chain.
function resyncNonce() {
  nextNonce = null;
}

/// Sends from the host key with a reserved nonce, confirming the receipt.
///
/// `confirmations` matters more than it looks: a transfer being mined does not
/// make the money spendable. Monad validates a new transaction against settled
/// state, so a burner funded in block N is still rejected as "insufficient
/// balance" for roughly eight blocks afterwards. Returning as soon as the
/// transfer is mined hands the player a wallet that cannot yet pay to join.
/// `settled` is asked before any retry that changes the nonce, and answering
/// true means "the recipient already has what this transfer was for". Without
/// it, recovering from a nonce collision would risk paying a player twice — the
/// original transfer may well have landed under the nonce we lost.
export async function hostSend(
  tx: {to: Hex; value: bigint},
  confirmations = 10,
  settled?: () => Promise<boolean>,
): Promise<Hex | null> {
  // the nonce is held across ordinary retries: re-signing the same transfer with
  // the same nonce reproduces the same transaction, so a retry after a dropped
  // connection can never pay a player twice
  let nonce = await reserveNonce();
  for (let attempt = 0; ; attempt++) {
    try {
      const hash = await hostWallet().sendTransaction({
        ...tx,
        nonce,
        chain: activeChain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations,
      });
      if (receipt.status !== "success") throw new Error(`transfer reverted (${hash})`);
      return hash;
    } catch (e) {
      // Another sender took this nonce — on serverless, most likely a second
      // instance handling a simultaneous join. Recoverable, but only after
      // confirming the money did not already arrive.
      if (isNonceCollision(e) && attempt < 3) {
        if (settled && (await settled())) return null;
        resyncNonce();
        nonce = await reserveNonce();
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
        continue;
      }
      if (attempt >= 3 || !isNetworkBlip(e)) {
        resyncNonce();
        throw await explainFailure(e, 21_000n, tx.value);
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

type WriteArgs = {
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};

/// RPC nodes sit a block or two apart, so a transaction sent the instant we see
/// a phase flip can be validated against the previous phase and revert. That is
/// a transient disagreement about height, not a real error — retry it.
function isPhaseRace(e: unknown) {
  return e instanceof Error && /WrongPhase/.test(e.message);
}

/// Monad does not reject a transaction the sender cannot pay for — it mines it
/// and fails it, so an empty host key comes back as `reverted`, indistinguishable
/// from a contract rejecting the call on its merits. That sent us hunting a
/// phantom `startQuestion` bug while the real answer was a key holding 0.05 MON.
///
/// Checking the balance up front would cost an RPC round trip on every send, and
/// the reveal has a ten-second window to hit. So the check happens only once
/// something has already failed, where it is free.
async function explainFailure(e: unknown, gas: bigint, value = 0n): Promise<Error> {
  const err = e instanceof Error ? e : new Error(String(e));
  try {
    const address = hostAccount().address;
    const [balance, fees] = await Promise.all([
      publicClient.getBalance({address}),
      publicClient.estimateFeesPerGas(),
    ]);
    // Monad charges the full limit, so this is what must actually be on hand
    const need = gas * fees.maxFeePerGas + value;
    if (balance < need) {
      return new Error(
        `host key is out of MON — holds ${formatEther(balance)}, this transaction ` +
          `needs ${formatEther(need)} reserved. Top up ${address} at ` +
          `https://faucet.monad.xyz. (underlying: ${err.message.split("\n")[0]})`,
      );
    }
  } catch {
    // the diagnosis is a courtesy; never let it replace the real error
  }
  return err;
}

/// Two senders reached for the same nonce. Recoverable: re-read the counter and
/// try again, with jitter so the two do not collide again in lockstep.
function isNonceCollision(e: unknown) {
  return (
    e instanceof Error &&
    /nonce too low|nonce is too low|already known|replacement transaction underpriced|invalid nonce|known transaction/i.test(
      e.message,
    )
  );
}

/// The public RPC drops connections under load. Nothing is wrong with the
/// transaction; the request never arrived.
function isNetworkBlip(e: unknown) {
  return (
    e instanceof Error &&
    /fetch failed|HTTP request failed|timed out|timeout|socket|ECONNRESET/i.test(
      e.message,
    )
  );
}

export async function hostWrite({functionName, args, value}: WriteArgs) {
  const wallet = hostWallet();
  for (let attempt = 0; ; attempt++) {
    const nonce = await reserveNonce();
    try {
      const hash = await wallet.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName,
        args,
        value,
        nonce,
        gas: HOST_GAS[functionName],
        chain: activeChain,
      } as never);
      const receipt = await publicClient.waitForTransactionReceipt({hash});
      if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
      return {hash, receipt};
    } catch (e) {
      resyncNonce();
      if (attempt >= 4 || !(isPhaseRace(e) || isNetworkBlip(e) || isNonceCollision(e))) {
        throw await explainFailure(e, HOST_GAS[functionName] ?? 0n, value ?? 0n);
      }
      // jitter, so two instances that collided do not line up again
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1) + Math.random() * 250));
    }
  }
}

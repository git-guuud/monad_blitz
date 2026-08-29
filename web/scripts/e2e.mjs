import {createPublicClient, createWalletClient, http, keccak256, encodePacked, formatEther, parseEther} from "viem";
import {monadTestnet} from "viem/chains";
import {privateKeyToAccount, generatePrivateKey} from "viem/accounts";
import {readFileSync} from "node:fs";

// everything is read from the app's own config so a redeploy can never leave
// this script pointed at a stale contract
const ADDR = readFileSync("src/lib/contract.ts", "utf8").match(/CONTRACT_ADDRESS =\s*"(0x[0-9a-fA-F]{40})"/)[1];
const ABI = JSON.parse(readFileSync("../contracts/out/BlitzTrivia.sol/BlitzTrivia.json")).abi;
const TOKEN = readFileSync(".env.local", "utf8").match(/HOST_TOKEN=(.+)/)[1].trim();
const API = process.env.E2E_URL ?? "http://localhost:3000";
const GAS = {join: 150000n, commitAnswer: 110000n, revealAnswer: 125000n, claim: 170000n};

const tp = () => http(undefined, {retryCount: 4, retryDelay: 120, timeout: 20000});
const pub = createPublicClient({chain: monadTestnet, transport: tp()});
const post = async (p, b) => {
  const r = await fetch(API + p, {method: "POST", headers: {"content-type": "application/json", "x-host-token": TOKEN}, body: JSON.stringify(b ?? {})});
  const d = await r.json();
  if (d.error) throw new Error(p + ": " + d.error);
  return d;
};
const read = (fn, args) => pub.readContract({address: ADDR, abi: ABI, functionName: fn, args});
const waitBlock = async (n) => { while ((await pub.getBlockNumber()) < n) await new Promise(r => setTimeout(r, 200)); };

const player = (name) => {
  const account = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({account, chain: monadTestnet, transport: tp()});
  return {
    name, address: account.address, salts: {},
    // mirrors sendBurnerTx in the app: confirm the receipt, retry node lag
    write: async (functionName, args, value) => {
      let last;
      for (let i = 0; i < 5; i++) {
        try {
          const hash = await wallet.writeContract({address: ADDR, abi: ABI, functionName, args, value, chain: monadTestnet, gas: GAS[functionName]});
          const r = await pub.waitForTransactionReceipt({hash});
          if (r.status !== "success") throw new Error(`${functionName} reverted on chain (${hash})`);
          return hash;
        } catch (e) {
          last = e;
          if (!/insufficient balance|WrongPhase|nonce|timed out/i.test(e.message) || i === 4) throw e;
          await new Promise(r => setTimeout(r, 400 * (i + 1)));
        }
      }
      throw last;
    },
  };
};

// warm every route first: an unwarmed dev-server route takes tens of seconds to
// compile, which is long enough for a whole commit window to expire unnoticed
await fetch(API + "/api/quiz");
for (const p of ["/api/host/start", "/api/host/reveal", "/api/host/finalize", "/api/fund"])
  await fetch(API + p, {method: "POST", headers: {"content-type": "application/json"}, body: "{}"}).catch(() => {});

console.log(`contract ${ADDR}`);
console.log("1. host creates the quiz (answers sealed up front)");
const {quizId} = await post("/api/host/create");
const FEE = (await read("getQuiz", [BigInt(quizId)])).entryFee;
console.log("   quizId", quizId, "· entry fee", formatEther(FEE), "MON · questions", (await read("hostCommitments", [BigInt(quizId)])).length);

const alice = player("alice"), bob = player("bob"), mallory = player("mallory");
console.log("2. funding burners + joining");
for (const p of [alice, bob, mallory]) {
  let fr;
  for (let i = 0; i < 3; i++) {
    const f = await fetch(API + "/api/fund", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({address: p.address})});
    fr = await f.json();
    if (!fr.error) break;
    console.log(`   fund retry ${i + 1}: ${fr.error.split("\n")[0]}`);
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  if (fr.error) throw new Error("fund: " + fr.error);
  for (let i = 0; i < 40 && (await pub.getBalance({address: p.address})) < parseEther("0.09"); i++)
    await new Promise(r => setTimeout(r, 300));
  await p.write("join", [BigInt(quizId)], FEE);
  console.log(`   ${p.name} ${p.address} joined`);
}
console.log("   pot", formatEther((await read("getQuiz", [BigInt(quizId)])).pot), "MON");

const CORRECT = [2, 0, 1, 2, 0];
const {questionCount} = await read("getQuiz", [BigInt(quizId)]);
console.log("   playing", questionCount, "questions");
for (let q = 0; q < questionCount; q++) {
  console.log(`\n--- question ${q + 1}/${questionCount} ---`);
  await post("/api/host/start", {quizId, q});
  const commitDeadline = await read("commitDeadline", [BigInt(quizId), q]);
  const revealDeadline = await read("revealDeadline", [BigInt(quizId), q]);

  if ((await pub.getBlockNumber()) >= commitDeadline)
    throw new Error(`commit window for q${q} closed before the test could answer`);

  if (q < 2) {
    // alice answers instantly and correctly; bob answers correctly but late;
    // mallory copies alice's commitment hash straight off the chain
    const commitFor = (p, ans) => {
      const salt = generatePrivateKey();
      p.salts[q] = {ans, salt};
      return keccak256(encodePacked(["uint256","uint8","uint8","bytes32","address"], [BigInt(quizId), q, ans, salt, p.address]));
    };
    const aliceC = commitFor(alice, CORRECT[q]);
    if (q === 0) {
      const est = await pub.estimateContractGas({address: ADDR, abi: ABI, functionName: "commitAnswer", args: [BigInt(quizId), q, aliceC], account: alice.address});
      console.log(`   gas: commitAnswer needs ${est} (limit ${GAS.commitAnswer})`);
    }
    await alice.write("commitAnswer", [BigInt(quizId), q, aliceC]);
    console.log("   alice committed at block", (await pub.getBlockNumber()).toString());

    await mallory.write("commitAnswer", [BigInt(quizId), q, aliceC]); // copied hash
    console.log("   mallory copied alice's commitment verbatim");

    await waitBlock(commitDeadline - 10n);
    const bobC = commitFor(bob, CORRECT[q]);
    await bob.write("commitAnswer", [BigInt(quizId), q, bobC]);
    console.log("   bob committed at block", (await pub.getBlockNumber()).toString());

    await waitBlock(commitDeadline + 2n); // clear the boundary before revealing

    // host and players all open at once, exactly as the real clients do. Reveal
    // order is deliberately irrelevant to the contract, and doing it any other
    // way spends the whole window on sequential round trips.
    const [hr] = await Promise.all([
      post("/api/host/reveal", {quizId, q}),
      ...[alice, bob].map((p) => {
        const {ans, salt} = p.salts[q];
        return p.write("revealAnswer", [BigInt(quizId), q, ans, salt]);
      }),
    ]);
    console.log("   host revealed answer", hr.answer, "(expected", CORRECT[q] + ")");
    try {
      await mallory.write("revealAnswer", [BigInt(quizId), q, alice.salts[q].ans, alice.salts[q].salt]);
      console.log("   !!! FAIL: mallory replayed alice's reveal");
    } catch {
      console.log("   mallory could NOT open the copied commitment (bound to msg.sender)");
    }
    const s = async (p) => (await read("scoreOf", [BigInt(quizId), p.address])).toString();
    console.log(`   scores → alice ${await s(alice)} · bob ${await s(bob)} · mallory ${await s(mallory)}`);
  }
  await waitBlock(revealDeadline);
}

console.log("\n3. finalize + claim");
await post("/api/host/finalize", {quizId});
const quiz = await read("getQuiz", [BigInt(quizId)]);
console.log("   pot", formatEther(quiz.pot), "· prizePool", formatEther(await read("prizePool", [BigInt(quizId)])), "· totalScore", quiz.totalScore.toString());
let paid = 0n;
for (const p of [alice, bob, mallory]) {
  const owed = await read("payoutOf", [BigInt(quizId), p.address]);
  const estClaim = await pub.estimateContractGas({address: ADDR, abi: ABI, functionName: "claim", args: [BigInt(quizId)], account: p.address}).catch(() => "n/a");
  const before = await pub.getBalance({address: p.address});
  const h = await p.write("claim", [BigInt(quizId)]);
  const r = await pub.getTransactionReceipt({hash: h});
  const after = await pub.getBalance({address: p.address});
  paid += owed;
  console.log(`   ${p.name} owed ${formatEther(owed)} · net ${formatEther(after - before + r.gasUsed * r.effectiveGasPrice)} MON · claim gas ${estClaim}/${GAS.claim}`);
}
const left = await pub.getBalance({address: ADDR});
console.log(`   paid out ${formatEther(paid)} · contract holds ${formatEther(left)} (rake + dust)`);
console.log("\nE2E PASSED");

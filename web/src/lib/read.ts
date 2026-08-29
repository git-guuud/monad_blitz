import {publicClient} from "./chain";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "./contract";

const base = {address: CONTRACT_ADDRESS, abi: CONTRACT_ABI} as const;

export enum Phase {
  IDLE = 0,
  COMMIT = 1,
  REVEAL = 2,
  SCORED = 3,
}

export async function readNextQuizId(): Promise<number> {
  const n = await publicClient.readContract({...base, functionName: "nextQuizId"});
  return Number(n);
}

/// The live quiz is always the most recently created one.
export async function readActiveQuizId(): Promise<number | null> {
  const next = await readNextQuizId();
  return next === 0 ? null : next - 1;
}

export type Quiz = {
  host: `0x${string}`;
  entryFee: bigint;
  commitBlocks: number;
  revealBlocks: number;
  questionCount: number;
  nextQuestion: number;
  finalized: boolean;
  rakeClaimed: boolean;
  pot: bigint;
  totalScore: bigint;
};

export async function readQuiz(quizId: number): Promise<Quiz> {
  const z = (await publicClient.readContract({
    ...base,
    functionName: "getQuiz",
    args: [BigInt(quizId)],
  })) as Quiz;
  return z;
}

/// One multicall per tick: quiz, current phase, block height and both deadlines.
/// Everything the UI counts down from comes from block numbers, never Date.now().
export async function readRound(quizId: number, q: number) {
  const [quiz, phase, startBlock, commitDeadline, revealDeadline, hostRevealed] =
    await Promise.all([
      readQuiz(quizId),
      publicClient.readContract({
        ...base,
        functionName: "phaseOf",
        args: [BigInt(quizId), q],
      }) as Promise<number>,
      publicClient.readContract({
        ...base,
        functionName: "startBlock",
        args: [BigInt(quizId), q],
      }) as Promise<bigint>,
      publicClient.readContract({
        ...base,
        functionName: "commitDeadline",
        args: [BigInt(quizId), q],
      }) as Promise<bigint>,
      publicClient.readContract({
        ...base,
        functionName: "revealDeadline",
        args: [BigInt(quizId), q],
      }) as Promise<bigint>,
      publicClient.readContract({
        ...base,
        functionName: "hostRevealed",
        args: [BigInt(quizId), q],
      }) as Promise<boolean>,
    ]);
  return {quiz, phase: phase as Phase, startBlock, commitDeadline, revealDeadline, hostRevealed};
}

export async function readLeaderboard(quizId: number) {
  const [addrs, scores] = (await publicClient.readContract({
    ...base,
    functionName: "leaderboard",
    args: [BigInt(quizId)],
  })) as [readonly `0x${string}`[], readonly bigint[]];
  return addrs
    .map((address, i) => ({address, score: scores[i]}))
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));
}

export async function readJoined(quizId: number, player: `0x${string}`) {
  return (await publicClient.readContract({
    ...base,
    functionName: "joined",
    args: [BigInt(quizId), player],
  })) as boolean;
}

export async function readCommit(quizId: number, q: number, player: `0x${string}`) {
  return (await publicClient.readContract({
    ...base,
    functionName: "getCommit",
    args: [BigInt(quizId), q, player],
  })) as {commitment: `0x${string}`; points: number; revealed: boolean; answer: number};
}

export async function readPayout(quizId: number, player: `0x${string}`) {
  return (await publicClient.readContract({
    ...base,
    functionName: "payoutOf",
    args: [BigInt(quizId), player],
  })) as bigint;
}

export async function readClaimed(quizId: number, player: `0x${string}`) {
  return (await publicClient.readContract({
    ...base,
    functionName: "claimed",
    args: [BigInt(quizId), player],
  })) as boolean;
}

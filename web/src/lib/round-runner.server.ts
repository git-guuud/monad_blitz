import "server-only";
import {publicClient} from "./chain";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "./contract";
import {hostSalt, hostWrite} from "./host.server";
import {QUESTIONS} from "./questions.server";
import {Phase, readQuiz} from "./read";
import {describeError, logHost} from "@/app/api/_auth";

/// Drives a round from the server rather than from the host's browser.
///
/// It used to be a `setInterval` on the host screen. Browsers throttle timers in
/// background tabs to roughly one tick a minute, and the reveal window is 25
/// blocks — about ten seconds. Host and players on one machine means the host
/// tab is unfocused precisely while somebody is answering, so every reveal
/// window closed unobserved and `revealHostAnswer` was never sent.
///
/// Nothing here is remembered between calls. That is deliberate: on a platform
/// that runs each request in its own short-lived instance, module state either
/// vanishes or forks per instance, and a status flag held in memory would
/// confidently report "idle" for a round that is running fine somewhere else.
///
/// Every decision is instead read from the chain, which makes the driver
/// **idempotent and resumable**: whatever happened last time, calling it again
/// reads where the round actually is and does the next thing that is missing. If
/// an invocation is cut short, pressing Run round again picks up exactly there.

const base = {address: CONTRACT_ADDRESS, abi: CONTRACT_ABI} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function phaseOf(quizId: number, q: number) {
  return (await publicClient.readContract({
    ...base,
    functionName: "phaseOf",
    args: [BigInt(quizId), q],
  })) as Phase;
}

async function hostRevealedFor(quizId: number, q: number) {
  return (await publicClient.readContract({
    ...base,
    functionName: "hostRevealed",
    args: [BigInt(quizId), q],
  })) as boolean;
}

/// "Already done" is success, not failure: the state we read is a poll and so is
/// always slightly behind, and an action that lands after a previous attempt
/// succeeded reverts with exactly these.
const ALREADY = /AlreadyRevealed|AlreadyFinalized|BadQuestion|QuizStarted/;

export type RoundStatus = {
  quizId: number;
  settled: boolean;
  nextQuestion: number;
  questionCount: number;
  activeQuestion: number;
  phase: Phase;
  step: string;
};

/// Read from the chain, never from memory, so it is the same answer whichever
/// instance is asked.
export async function roundStatus(quizId: number): Promise<RoundStatus> {
  const quiz = await readQuiz(quizId);
  const q = quiz.nextQuestion - 1;
  const phase = q >= 0 ? await phaseOf(quizId, q) : Phase.IDLE;
  const step = quiz.finalized
    ? "settled"
    : quiz.nextQuestion === 0
      ? "lobby open — press Run round to start"
      : phase === Phase.COMMIT
        ? `question ${quiz.nextQuestion} — players answering`
        : phase === Phase.REVEAL
          ? `question ${quiz.nextQuestion} — revealing`
          : quiz.nextQuestion < quiz.questionCount
            ? `question ${quiz.nextQuestion} scored`
            : "ready to settle";
  return {
    quizId,
    settled: quiz.finalized,
    nextQuestion: quiz.nextQuestion,
    questionCount: quiz.questionCount,
    activeQuestion: q,
    phase,
    step,
  };
}

/// Drives the round to settlement, or until `budgetMs` runs out.
///
/// The budget exists because a serverless invocation is killed at its
/// `maxDuration` with no warning. Stopping a little early and leaving the round
/// resumable beats being cut off mid-transaction with a nonce already spent.
export async function driveRound(quizId: number, budgetMs: number) {
  const deadline = Date.now() + budgetMs;
  let failures = 0;
  logHost("drive start", {quiz: quizId, budgetMs});

  while (Date.now() < deadline) {
    const quiz = await readQuiz(quizId);
    if (quiz.finalized) {
      logHost("drive settled", {quiz: quizId});
      return;
    }

    try {
      if (quiz.nextQuestion === 0) {
        await start(quizId, 0);
      } else {
        const q = quiz.nextQuestion - 1;
        const phase = await phaseOf(quizId, q);

        if (phase === Phase.REVEAL && !(await hostRevealedFor(quizId, q))) {
          await reveal(quizId, q);
        } else if (phase === Phase.SCORED && quiz.nextQuestion < quiz.questionCount) {
          await start(quizId, quiz.nextQuestion);
        } else if (phase === Phase.SCORED && quiz.nextQuestion === quiz.questionCount) {
          await finalize(quizId);
        } else {
          // inside a window with nothing to do but wait it out
          await sleep(250);
        }
      }
      failures = 0;
    } catch (e) {
      const message = describeError(e);
      if (ALREADY.test(message)) {
        failures = 0;
        continue;
      }
      // a reverted action is usually a phase we just missed; the next pass
      // re-reads the chain and picks the action that fits where we now are
      if (++failures >= 5) {
        logHost("drive giving up", {quiz: quizId, error: message});
        return;
      }
      await sleep(400 * failures);
    }
  }
  // out of budget, not out of round — the chain still holds the whole story, so
  // another Run round resumes from here
  logHost("drive out of time", {quiz: quizId});
}

/// Every action leaves a line with how long it took. Duration is the number
/// worth having: the reveal has a ~10s window, so one that lands in 8s is one
/// slow block away from being the failure that costs the question.
async function act<T>(
  action: string,
  detail: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const out = await fn();
    logHost(`${action} ok`, {...detail, ms: Date.now() - started});
    return out;
  } catch (e) {
    logHost(`${action} FAILED`, {...detail, ms: Date.now() - started, error: describeError(e)});
    throw e;
  }
}

function start(quizId: number, q: number) {
  return act("start", {quiz: quizId, q}, () =>
    hostWrite({functionName: "startQuestion", args: [BigInt(quizId), q]}),
  );
}

function reveal(quizId: number, q: number) {
  return act("reveal", {quiz: quizId, q}, () =>
    hostWrite({
      functionName: "revealHostAnswer",
      args: [BigInt(quizId), q, QUESTIONS[q].answer, hostSalt(quizId, q)],
    }),
  );
}

function finalize(quizId: number) {
  return act("finalize", {quiz: quizId}, () =>
    hostWrite({functionName: "finalize", args: [BigInt(quizId)]}),
  );
}

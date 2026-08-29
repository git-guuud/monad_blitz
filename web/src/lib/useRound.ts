"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {publicClient} from "./chain";
import {Phase, readLeaderboard, readQuiz, type Quiz} from "./read";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "./contract";
import {BLOCK_MS, type PublicQuestion} from "./quiz-config";

export type QuizMeta = {
  quizId: number | null;
  questions: PublicQuestion[];
  host?: `0x${string}`;
};

export function useQuizMeta() {
  const [meta, setMeta] = useState<QuizMeta | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/quiz", {cache: "no-store"});
      const data = await res.json();
      if (alive) setMeta(data);
    };
    load();
    // a new quiz can be created mid-session; pick it up without a refresh
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return meta;
}

export type Leader = {address: `0x${string}`; score: bigint};

export type RoundState = {
  /// Interpolated between polls — what the countdown is drawn from.
  block: bigint;
  /// The last height actually read from the chain. Effects that fetch should key
  /// off this, never off `block`, or they refire ten times a second.
  chainBlock: bigint;
  quiz: Quiz | null;
  /// index of the question the host has started most recently, -1 before the first
  activeQuestion: number;
  phase: Phase;
  commitDeadline: bigint;
  revealDeadline: bigint;
  hostRevealed: boolean;
  hostAnswer: number | null;
  leaderboard: Leader[];
};

/// Exactly the contract's `phaseOf`. Deriving it here rather than reading it
/// means the phase and the countdown are computed from the *same* block number,
/// so they cannot disagree — the old code read `phaseOf` over RPC while drawing
/// the clock from a separately-read height, which is why a question settled
/// while the timer still had a second on it.
function phaseAt(block: bigint, commitDeadline: bigint, revealDeadline: bigint): Phase {
  if (commitDeadline === 0n) return Phase.IDLE;
  if (block < commitDeadline) return Phase.COMMIT;
  if (block < revealDeadline) return Phase.REVEAL;
  return Phase.SCORED;
}

type Polled = Omit<RoundState, "leaderboard" | "block" | "phase"> & {at: number};

/// How far the clock is allowed to run on its own. Past this the RPC has stopped
/// answering, and a countdown that keeps sprinting on a dead feed is worse than
/// one that visibly stalls.
const MAX_DRIFT_BLOCKS = 25n;

const EMPTY: Omit<Polled, "at"> = {
  chainBlock: 0n,
  quiz: null,
  activeQuestion: -1,
  commitDeadline: 0n,
  revealDeadline: 0n,
  hostRevealed: false,
  hostAnswer: null,
};

/// Polls the chain, not a clock. Every deadline the UI draws is a block number,
/// so the countdown on screen can never disagree with the contract.
///
/// The leaderboard is polled on a **separate** timer, and that separation is
/// load-bearing rather than tidiness. `leaderboard()` walks every player against
/// every question, so it is by far the slowest read here. Sharing one tick with
/// the phase read meant the tick took as long as the leaderboard did, and the
/// in-flight guard held off the next tick until it returned — so on a busy
/// public RPC the host could poll once during COMMIT and not again until SCORED,
/// stepping straight over the 25-block REVEAL window without ever observing it.
/// The host reveal is dispatched from that observation, so it was never sent:
/// every question stalled with `hostRevealed` false and nobody scoring.
///
/// Keeping them apart means a slow leaderboard can only ever make scores stale.
/// It can no longer cost the round a phase.
export function useRound(quizId: number | null, intervalMs = 500, boardEvery = 1) {
  const [state, setState] = useState<Polled>({...EMPTY, at: 0});
  /// The interpolated clock. Blocks are 400ms, so a 100ms step is four frames a
  /// block — smooth to watch, and far cheaper than polling the chain that fast.
  const [block, setBlock] = useState(0n);
  const [leaderboard, setLeaderboard] = useState<Leader[]>([]);
  const busy = useRef(false);

  // ------------------------------------------------- fast loop: round timing
  useEffect(() => {
    if (quizId === null) return;
    let alive = true;

    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const [block, quiz] = await Promise.all([
          publicClient.getBlockNumber(),
          readQuiz(quizId),
        ]);
        const q = quiz.nextQuestion - 1;
        if (q < 0) {
          if (alive) setState({...EMPTY, chainBlock: block, quiz, at: Date.now()});
          return;
        }
        const base = {address: CONTRACT_ADDRESS, abi: CONTRACT_ABI} as const;
        const [, commitDeadline, revealDeadline, hostRevealed, hostAnswer] =
          await Promise.all([
            publicClient.readContract({
              ...base,
              functionName: "phaseOf",
              args: [BigInt(quizId), q],
            }) as Promise<number>,
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
            publicClient.readContract({
              ...base,
              functionName: "hostAnswer",
              args: [BigInt(quizId), q],
            }) as Promise<number>,
          ]);
        if (!alive) return;
        setState({
          chainBlock: block,
          at: Date.now(),
          quiz,
          activeQuestion: q,
          commitDeadline,
          revealDeadline,
          hostRevealed,
          hostAnswer: hostRevealed ? hostAnswer : null,
        });
      } catch {
        // a dropped RPC read must never stall the loop — the next tick retries
      } finally {
        busy.current = false;
      }
    };

    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [quizId, intervalMs]);

  // ------------------------------------------- slow loop: scores, on its own
  useEffect(() => {
    if (quizId === null) return;
    let alive = true;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const board = await readLeaderboard(quizId);
        // hold the previous board on a dropped read: a score that blinks to
        // empty for one tick reads as "everyone lost their points"
        if (alive && board.length) setLeaderboard(board);
      } catch {
        // next tick retries
      } finally {
        inFlight = false;
      }
    };

    tick();
    const timer = setInterval(tick, intervalMs * Math.max(1, boardEvery));
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [quizId, intervalMs, boardEvery]);

  // Estimate the height between polls instead of stepping only when one lands.
  // A poll costs a round trip, so drawing the clock straight off it made the
  // countdown lurch by an irregular number of blocks each time it returned.
  useEffect(() => {
    const timer = setInterval(() => {
      setBlock((prev) => {
        if (state.at === 0) return prev;
        const drift = BigInt(Math.floor((Date.now() - state.at) / BLOCK_MS));
        const next =
          state.chainBlock + (drift > MAX_DRIFT_BLOCKS ? MAX_DRIFT_BLOCKS : drift);
        // never let the clock run backwards: a poll landing a block behind our
        // estimate would otherwise put time back on a window that is closing
        return next > prev ? next : prev;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [state]);

  const phase = phaseAt(block, state.commitDeadline, state.revealDeadline);

  return useMemo<RoundState>(
    () => ({...state, block, phase, leaderboard}),
    [state, block, phase, leaderboard],
  );
}

export function blocksLeft(deadline: bigint, block: bigint) {
  return deadline > block ? Number(deadline - block) : 0;
}

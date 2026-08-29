"use client";

import {
  ArrowLeftIcon,
  BoltIcon,
  ClockIcon,
  DotsIcon,
  LockIcon,
  UsersIcon,
} from "@/components/icons";
import {Banner} from "@/components/ui";
import {CHOICE_LABELS} from "@/lib/quiz-config";
import {Phase} from "@/lib/read";

/// The three tiles the design gives to "choose your confidence". There is no
/// per-question stake in the contract — the entry fee is paid once, at join —
/// so inventing a wager here would be a button that lies. What the contract
/// *does* pay for is speed, so the tiles show the speed ladder instead: the one
/// you are currently in lights up, and it slides left as the window drains.
const TIERS = [
  {name: "Steady", from: 100, to: 133},
  {name: "Quick", from: 134, to: 166},
  {name: "Blitz", from: 167, to: 200},
];

export function GameScreen({
  roomCode,
  players,
  questionIndex,
  questionCount,
  prompt,
  choices,
  phase,
  blocksLeft,
  blocksTotal,
  picked,
  hostAnswer,
  committed,
  committing,
  livePoints,
  lockedPoints,
  pointsConfirmed,
  entryFee,
  status,
  error,
  onPick,
  onExit,
}: {
  roomCode: string;
  players: number;
  questionIndex: number;
  questionCount: number;
  prompt: string;
  choices: string[];
  phase: Phase;
  blocksLeft: number;
  blocksTotal: number;
  picked: number | null;
  hostAnswer: number | null;
  committed: boolean;
  committing: boolean;
  /// what this answer would score if it landed in the next block
  livePoints: number;
  /// what it actually scored, once the commit is on chain
  lockedPoints: number | null;
  /// false while the commit is in flight and the figure is still our estimate
  pointsConfirmed: boolean;
  entryFee: string;
  status: string | null;
  error: string | null;
  onPick: (i: number) => void;
  onExit: () => void;
}) {
  const open = phase === Phase.COMMIT && !committed && !committing;
  const points = lockedPoints ?? livePoints;
  const activeTier = TIERS.findIndex((t) => points >= t.from && points <= t.to);
  const pct = blocksTotal > 0 ? Math.max(0, Math.min(1, blocksLeft / blocksTotal)) : 0;
  const seconds = (blocksLeft * 0.4).toFixed(1);

  return (
    <div className="flex flex-1 flex-col bg-stage">
      {/* ---------------------------------------------------------- header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-sm font-semibold text-rail-muted transition hover:text-rail-text"
        >
          <ArrowLeftIcon width={18} height={18} />
          <span className="hidden sm:inline">Exit Game</span>
        </button>

        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
            Room Code
          </p>
          <p className="font-mono text-lg font-bold leading-tight tracking-[0.2em] text-brand">
            {roomCode}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-rail-muted">
            <UsersIcon width={18} height={18} />
            <span className="text-sm font-bold text-rail-text">
              {players}
              <span className="ml-1 hidden font-medium text-rail-muted sm:inline">
                Players
              </span>
            </span>
          </span>
          <DotsIcon className="hidden text-rail-muted sm:block" width={18} height={18} />
        </div>
      </header>

      {/* ------------------------------------------------------------ card */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-3 pb-3 sm:px-6 sm:pb-5">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">
              Question {questionIndex + 1}/{questionCount}
            </p>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <span className="hidden sm:inline">
                {phase === Phase.COMMIT ? "Time Left" : "Reveal"}
              </span>
              <ClockIcon width={15} height={15} />
              <span className={phase === Phase.COMMIT ? "text-brand-strong" : "text-action"}>
                {seconds}s
              </span>
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
                phase === Phase.COMMIT ? "bg-brand" : "bg-action"
              }`}
              style={{width: `${pct * 100}%`}}
            />
          </div>
          <p className="mt-1 text-right font-mono text-[10px] text-muted">
            {blocksLeft} blocks
          </p>

          {/* ------------------------------------------------------ prompt */}
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
            <h2 className="text-center text-lg font-bold leading-snug sm:text-xl">
              {prompt}
            </h2>

            <div className="mt-4 space-y-2.5">
              {choices.map((choice, i) => {
                const isPicked = picked === i;
                const isCorrect = hostAnswer === i;
                // once the host has revealed, the right answer outranks the
                // player's pick — a wrong pick still shows, dimmed
                const state = isCorrect ? "correct" : isPicked ? "picked" : "plain";
                return (
                  <button
                    key={i}
                    onClick={() => onPick(i)}
                    disabled={!open}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left font-medium transition sm:px-4",
                      state === "correct"
                        ? "border-brand bg-brand/12 text-brand-strong"
                        : state === "picked"
                          ? "border-brand bg-brand/10"
                          : "border-border bg-surface",
                      open ? "hover:border-action hover:bg-action/5" : "",
                      !open && state === "plain" ? "opacity-55" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                        state === "plain"
                          ? "border border-border text-muted"
                          : "bg-brand text-white",
                      ].join(" ")}
                    >
                      {CHOICE_LABELS[i]}
                    </span>
                    <span className="min-w-0">{choice}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ------------------------------------------------- speed ladder */}
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-center text-sm font-bold">
              {!committed
                ? "This answer is worth"
                : pointsConfirmed
                  ? "Locked in at"
                  : "Sealing at about"}{" "}
              <span className="text-brand-strong">{points} pts</span>
            </p>
            <p className="mt-0.5 text-center text-xs text-muted">
              {!committed
                ? "Answer faster, score more — the clock is blocks, not seconds."
                : pointsConfirmed
                  ? "Points were fixed by the block your answer landed in."
                  : "Confirming which block your answer landed in…"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {TIERS.map((tier, i) => (
                <div
                  key={tier.name}
                  className={[
                    "rounded-xl border px-2 py-2.5 text-center transition",
                    i === activeTier
                      ? "border-action bg-action/10"
                      : "border-border bg-surface opacity-60",
                  ].join(" ")}
                >
                  <p
                    className={`text-sm font-bold ${
                      i === activeTier ? "text-action" : ""
                    }`}
                  >
                    {tier.name}
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    {tier.from}–{tier.to}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {(status || error) && (
            <div className="mt-3">
              {error ? <Banner tone="error">{error}</Banner> : <Banner tone="info">{status}</Banner>}
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- foot bar */}
      <footer className="flex items-center justify-between gap-3 border-t border-rail-3 bg-stage-2 px-4 py-3 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
            Your Stake
          </p>
          <p className="flex items-center gap-1.5 font-mono text-sm font-bold text-rail-text">
            <BoltIcon className="text-action" width={13} height={13} />
            {entryFee} MON
          </p>
        </div>

        <span
          className={[
            "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold",
            committed
              ? "bg-brand text-white"
              : committing
                ? "bg-action/70 text-white"
                : open
                  ? "border border-rail-3 text-rail-muted"
                  : "border border-rail-3 text-rail-muted",
          ].join(" ")}
        >
          {committed ? (
            <>
              <LockIcon width={15} height={15} />
              {phase === Phase.REVEAL ? "Opening…" : "Sealed on chain"}
            </>
          ) : committing ? (
            "Sealing…"
          ) : open ? (
            "Tap an answer to lock in"
          ) : (
            "Window closed"
          )}
        </span>
      </footer>
    </div>
  );
}

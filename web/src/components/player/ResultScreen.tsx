"use client";

import {useMemo} from "react";
import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  CrossIcon,
  UsersIcon,
} from "@/components/icons";

const CONFETTI_COLORS = ["#22c55e", "#2563eb", "#f59e0b", "#ef4444", "#a855f7"];

function Confetti() {
  // seeded once per mount so a re-render mid-fall does not restart the pieces
  const bits = useMemo(
    () =>
      Array.from({length: 42}, (_, i) => ({
        left: (i * 97) % 100,
        drift: ((i * 53) % 120) - 60,
        delay: ((i * 37) % 900) / 1000,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}s`,
            ["--drift" as string]: `${b.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function ResultScreen({
  correct,
  pointsEarned,
  speedBonus,
  score,
  rank,
  players,
  roomCode,
  blocksLeft,
  blocksTotal,
  actionLabel,
  onAction,
  actionBusy,
}: {
  correct: boolean;
  pointsEarned: number;
  speedBonus: number;
  score: string;
  rank: number | null;
  players: number;
  roomCode: string;
  /// The reveal window keeps running under the result. Cutting straight to the
  /// score with the clock still on screen read as the phase ending early —
  /// especially with one player, where everything resolves in a second or two
  /// and the remaining eight had nothing to show for themselves.
  blocksLeft: number;
  blocksTotal: number;
  actionLabel: string;
  onAction?: () => void;
  actionBusy?: boolean;
}) {
  return (
    <div className="relative flex flex-1 flex-col bg-stage text-rail-text">
      {correct && <Confetti />}

      <header className="flex items-center justify-between px-4 py-3.5 sm:px-6">
        <span className="text-sm font-semibold text-rail-muted">Question scored</span>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
            Room Code
          </p>
          <p className="font-mono text-lg font-bold leading-tight tracking-[0.2em] text-brand">
            {roomCode}
          </p>
        </div>
        <span className="flex items-center gap-2 text-rail-muted">
          <UsersIcon width={18} height={18} />
          <span className="text-sm font-bold text-rail-text">{players}</span>
        </span>
      </header>

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <span
          className={[
            "pop-in grid h-20 w-20 place-items-center rounded-full",
            correct ? "bg-brand text-white" : "bg-rail-3 text-rail-muted",
          ].join(" ")}
        >
          {correct ? (
            <CheckIcon width={38} height={38} />
          ) : (
            <CrossIcon width={34} height={34} />
          )}
        </span>

        <h1 className="mt-5 text-3xl font-black tracking-tight">
          {correct ? "Correct!" : "Not this time"}
        </h1>
        <p className="mt-1.5 text-sm text-rail-muted">
          {correct ? "You earned" : "No points — your entry stays in the pot"}
        </p>
        {correct && (
          <p className="mt-1 text-3xl font-black text-brand">+{pointsEarned} pts</p>
        )}

        <div className="mt-7 w-full rounded-2xl border border-rail-3 bg-stage-2 p-4 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-rail-muted">
                {correct ? "Speed bonus" : "Base points"}
              </p>
              <p className="mt-0.5 text-sm font-bold">
                {correct
                  ? `100 base + ${speedBonus} for the blocks you had left`
                  : "Awarded only for a correct answer"}
              </p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-action/20 text-action">
              <BoltIcon width={18} height={18} />
            </span>
          </div>
        </div>

        <div className="mt-6 flex w-full items-end justify-between">
          <div className="text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
              Current Score
            </p>
            <p className="mt-0.5 text-2xl font-black">
              {score} <span className="text-base font-bold text-rail-muted">pts</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
              Rank
            </p>
            <p className="mt-0.5 text-2xl font-black">
              {rank ?? "—"}
              <span className="text-base font-bold text-rail-muted"> / {players}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="relative px-4 pb-5 sm:px-6">
        <div className="mx-auto mb-3 h-1 w-full max-w-md overflow-hidden rounded-full bg-rail-3">
          <div
            className="h-full rounded-full bg-action transition-[width] duration-200 ease-linear"
            style={{
              width: `${
                blocksTotal > 0
                  ? Math.max(0, Math.min(100, (blocksLeft / blocksTotal) * 100))
                  : 0
              }%`,
            }}
          />
        </div>
        <button
          onClick={onAction}
          disabled={!onAction || actionBusy}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-action px-6 py-3.5 text-base font-bold text-white transition hover:bg-action-strong disabled:cursor-default disabled:opacity-60"
        >
          {actionLabel}
          {onAction && <ArrowRightIcon width={18} height={18} />}
        </button>
      </div>
    </div>
  );
}

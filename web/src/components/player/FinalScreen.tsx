"use client";

import {BoltIcon, TrophyIcon} from "@/components/icons";
import {Banner} from "@/components/ui";

export function FinalScreen({
  payout,
  score,
  rank,
  players,
  pot,
  roomCode,
  claimed,
  claiming,
  onClaim,
  error,
}: {
  payout: string;
  score: string;
  rank: number | null;
  players: number;
  pot: string;
  roomCode: string;
  claimed: boolean;
  claiming: boolean;
  onClaim: () => void;
  error: string | null;
}) {
  const won = Number(payout) > 0;
  return (
    <div className="flex flex-1 flex-col bg-stage text-rail-text">
      <header className="flex items-center justify-between px-4 py-3.5 sm:px-6">
        <span className="text-sm font-semibold text-rail-muted">Round settled</span>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
            Room Code
          </p>
          <p className="font-mono text-lg font-bold leading-tight tracking-[0.2em] text-brand">
            {roomCode}
          </p>
        </div>
        <span className="w-24" />
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <span className="pop-in grid h-20 w-20 place-items-center rounded-full bg-brand/15 text-brand">
          <TrophyIcon width={38} height={38} />
        </span>
        <h1 className="mt-5 text-3xl font-black tracking-tight">
          {won ? "You're in the money" : "That's the round"}
        </h1>
        <p className="mt-1.5 text-sm text-rail-muted">
          The pot split by share of score. Withdrawals are pull-based, so nothing moves
          until you claim it.
        </p>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
          Your payout
        </p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-black text-brand">
          <BoltIcon width={28} height={28} />
          {payout}
          <span className="text-lg font-bold text-rail-muted">MON</span>
        </p>

        <div className="mt-7 grid w-full grid-cols-3 gap-2">
          {[
            {label: "Score", value: score},
            {label: "Rank", value: rank ? `${rank}/${players}` : "—"},
            {label: "Pot", value: `${pot}`},
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-rail-3 bg-stage-2 px-2 py-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-muted">
                {s.label}
              </p>
              <p className="mt-1 truncate text-lg font-black">{s.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 w-full">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <button
          onClick={onClaim}
          disabled={claimed || claiming || !won}
          className="mx-auto flex w-full max-w-md items-center justify-center rounded-xl bg-action px-6 py-3.5 text-base font-bold text-white transition hover:bg-action-strong disabled:cursor-not-allowed disabled:opacity-45"
        >
          {claimed
            ? "Claimed"
            : claiming
              ? "Claiming…"
              : won
                ? "Claim your MON"
                : "Nothing to claim"}
        </button>
      </div>
    </div>
  );
}

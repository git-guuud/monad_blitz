"use client";

import {ArrowLeftIcon, BoltIcon} from "@/components/icons";
import {Banner, ThemeToggle, short} from "@/components/ui";

function Row({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function JoinScreen({
  roomCode,
  host,
  players,
  entryFee,
  questionCount,
  status,
  error,
  busy,
  closed,
  onJoin,
  onCancel,
}: {
  roomCode: string;
  host?: string;
  players: number;
  entryFee: string;
  questionCount: number;
  status: string | null;
  error: string | null;
  busy: string | null;
  /// question 1 has started, so the contract will reject a join from here on
  closed: boolean;
  onJoin: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-text"
        >
          <ArrowLeftIcon width={18} height={18} />
          Back
        </button>
        <ThemeToggle />
      </header>

      <div className="mx-auto w-full max-w-md px-5 pb-14 sm:px-8">
        <h1 className="text-2xl font-black tracking-tight">Join a Game</h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;re joining the live room on Monad testnet.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {roomCode.split("").map((digit, i) => (
            <span
              key={i}
              className="grid h-14 w-12 place-items-center rounded-xl border border-border bg-surface-2 text-2xl font-black tabular-nums"
            >
              {digit}
            </span>
          ))}
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-surface p-5"
          style={{boxShadow: "var(--shadow)"}}
        >
          <p className="text-sm font-bold">Room Details</p>
          <div className="mt-2">
            <Row label="Game Name" value="Blitz Trivia" />
            <Row
              label="Host"
              value={<span className="font-mono">{host ? short(host) : "—"}</span>}
            />
            <Row label="Questions" value={questionCount} />
            <Row label="Players" value={players} />
            <Row
              label="Entry Fee"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <BoltIcon className="text-action" width={14} height={14} />
                  <span className="font-mono">{entryFee} MON</span>
                </span>
              }
            />
          </div>
        </div>

        <button
          onClick={onJoin}
          disabled={!!busy || closed}
          className="mt-5 w-full rounded-xl bg-action px-6 py-3.5 text-base font-bold text-white transition hover:bg-action-strong disabled:cursor-not-allowed disabled:opacity-45"
        >
          {closed
            ? "Round already started"
            : busy === "funding"
              ? "Funding your wallet…"
              : busy === "joining"
                ? "Joining…"
                : "Join Game"}
        </button>
        <button
          onClick={onCancel}
          className="mt-2 w-full rounded-xl border border-border px-6 py-3 text-sm font-semibold text-muted transition hover:text-text"
        >
          Cancel
        </button>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          A burner wallet is generated in your browser and funded by the host — no
          extension, no popups, no signing on every question.
        </p>

        <div className="mt-4 space-y-2">
          {status && !error && <Banner tone="info">{status}</Banner>}
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </div>
    </div>
  );
}

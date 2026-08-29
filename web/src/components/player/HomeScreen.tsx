"use client";

import {useState} from "react";
import {
  ArrowRightIcon,
  BoltIcon,
  JoinIcon,
  LockIcon,
  PlusIcon,
  TrophyIcon,
} from "@/components/icons";
import {Card, ThemeToggle} from "@/components/ui";

const STEPS = [
  {
    icon: JoinIcon,
    title: "1. Join the room",
    body: "Type the four-digit code from the host screen and pay the entry fee.",
  },
  {
    icon: LockIcon,
    title: "2. Answer, sealed",
    body: "Your answer lands on chain as a hash. Nobody can read it — not even the host.",
  },
  {
    icon: BoltIcon,
    title: "3. Score on speed",
    body: "100 points for correct, up to 100 more for the blocks you had left.",
  },
  {
    icon: TrophyIcon,
    title: "4. Win MON",
    body: "The pot splits by share of score and pays out the moment the round ends.",
  },
];

export function HomeScreen({
  roomCode,
  settled,
  entryFee,
  players,
  liveGame,
  onSubmitCode,
  onResume,
  wallet,
}: {
  /// null until the host has created a quiz — there is nothing to join yet
  roomCode: string | null;
  /// the last round on chain has already paid out — its code will not accept a join
  settled: boolean;
  entryFee: string;
  players: number;
  /// true once this browser has paid in and the round is under way
  liveGame: boolean;
  onSubmitCode: (code: string) => string | null;
  onResume: () => void;
  wallet: {address: string; balance: string; href: string} | null;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => setError(onSubmitCode(code.trim()));

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-end gap-3 px-5 py-4 sm:px-8">
        <ThemeToggle />
        {wallet ? (
          <a
            href={wallet.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-bold text-white transition hover:bg-action-strong"
          >
            <span className="font-mono">{wallet.address}</span>
            <span className="hidden text-white/70 sm:inline">{wallet.balance}</span>
          </a>
        ) : (
          <span className="rounded-xl bg-action/60 px-4 py-2.5 text-sm font-bold text-white">
            Creating wallet…
          </span>
        )}
      </header>

      <div className="mx-auto w-full max-w-4xl px-5 pb-14 sm:px-8">
        <p className="text-sm text-muted">Welcome back 👋</p>
        <h1 className="mt-2 text-3xl font-black leading-[1.15] tracking-tight sm:text-4xl">
          Ready to put your
          <br />
          <span className="text-brand">knowledge</span> to the test?
        </h1>
        <p className="mt-3 text-sm text-muted">
          Answer faster than the room, keep your answer sealed, and win MON.
        </p>

        {liveGame && (
          <button
            onClick={onResume}
            className="mt-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-4 text-left transition hover:bg-brand/15"
          >
            <span>
              <span className="text-sm font-bold text-brand-strong">
                You&apos;re in room {roomCode}
              </span>
              <span className="block text-xs text-muted">
                The round is still running — jump back in.
              </span>
            </span>
            <ArrowRightIcon className="text-brand-strong" />
          </button>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <Card>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-action/10 text-action">
              <JoinIcon />
            </span>
            <h2 className="mt-4 text-xl font-bold">Join a Game</h2>
            <p className="mt-1 text-sm text-muted">
              Enter the room code shown on the host screen.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                value={code}
                inputMode="numeric"
                maxLength={4}
                placeholder="Enter code"
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 font-mono tracking-[0.3em] outline-none placeholder:tracking-normal placeholder:font-sans focus:border-action"
              />
              <button
                onClick={submit}
                aria-label="Join room"
                className="grid w-12 shrink-0 place-items-center rounded-xl bg-action text-white transition hover:bg-action-strong"
              >
                <ArrowRightIcon />
              </button>
            </div>
            <p className="mt-2 min-h-[1.25rem] text-xs">
              {error ? (
                <span className="text-danger">{error}</span>
              ) : settled ? (
                <span className="text-muted">
                  Last round settled — ask the host to open a new one.
                </span>
              ) : roomCode ? (
                <span className="text-muted">
                  Room <span className="font-mono text-brand-strong">{roomCode}</span> is
                  live · {players} {players === 1 ? "player" : "players"} in
                </span>
              ) : (
                <span className="text-muted">
                  No room on chain yet — the host has to create one.
                </span>
              )}
            </p>
          </Card>

          <Card>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand-strong">
              <PlusIcon />
            </span>
            <h2 className="mt-4 text-xl font-bold">Create a Game</h2>
            <p className="mt-1 text-sm text-muted">
              Seal the answers on chain and open a room for the people around you.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm">
              <span className="text-muted">Entry fee</span>
              <span className="float-right font-mono font-semibold">{entryFee} MON</span>
            </div>
            <a
              href="/host"
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-strong"
            >
              Create Game
            </a>
            <p className="mt-2 text-xs text-muted">Opens the host screen. Needs a host token.</p>
          </Card>
        </div>

        <h3 className="mt-11 text-lg font-bold">How QuizBlitz works</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({icon: Icon, title, body}) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-surface-2 px-4 py-5 text-center"
            >
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-brand/10 text-brand-strong">
                <Icon />
              </span>
              <p className="mt-3 text-sm font-bold">{title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

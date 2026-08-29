"use client";

import {useCallback, useEffect, useState} from "react";
import {formatEther} from "viem";
import QRCode from "qrcode";
import {explorerAddress, publicClient} from "@/lib/chain";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "@/lib/contract";
import {Phase} from "@/lib/read";
import {blocksLeft, useQuizMeta, useRound} from "@/lib/useRound";
import {roomCodeFor} from "@/lib/room-code";
import {
  CHOICE_LABELS,
  COMMIT_BLOCKS,
  ENTRY_FEE,
  RAKE_BPS,
  REVEAL_BLOCKS,
} from "@/lib/quiz-config";
import {AppShell, Banner, Button, Card, Label, Pill, ThemeToggle, short} from "@/components/ui";
import {BoltIcon, ClockIcon, LockIcon, TrophyIcon, UsersIcon} from "@/components/icons";

type FeedItem = {
  kind: "commit" | "reveal";
  player: `0x${string}`;
  detail: string;
  correct?: boolean;
  key: string;
  /// stamped so the feed can be filtered to the live question during render,
  /// rather than cleared by an effect that fires a frame late
  question: number;
};

export default function HostPage() {
  const meta = useQuizMeta();
  const quizId = meta?.quizId ?? null;
  // 400ms for round timing, ~2s for scores: the reveal window is 25 blocks
  // wide and missing it costs the question, a stale score costs nothing
  const round = useRound(quizId, 400, 5);

  const [token, setToken] = useState("");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------- setup

  useEffect(() => {
    // localStorage and window.location are browser-only, so this has to happen
    // after hydration — rendering from them directly would mismatch the server
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) localStorage.setItem("blitz.host.token", fromUrl);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(fromUrl ?? localStorage.getItem("blitz.host.token") ?? "");

    const url = window.location.origin;
    setJoinUrl(url);
    // black on white, so the code stays scannable on the light card in either
    // theme — a QR inverted against its surround will not read on some phones
    QRCode.toDataURL(url, {margin: 1, width: 320, color: {dark: "#0b0f19", light: "#ffffff"}})
      .then(setQr)
      .catch(() => {});
  }, []);

  const post = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(path, {
        method: "POST",
        headers: {"content-type": "application/json", "x-host-token": token},
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    },
    [token],
  );

  // ---------------------------------------------------------------- live feed

  useEffect(() => {
    if (quizId === null) return;
    const unwatchCommit = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: "AnswerCommitted",
      pollingInterval: 400,
      onLogs: (logs) => {
        setFeed((prev) =>
          [
            ...logs.map((log) => {
              const a = log.args as {
                player: `0x${string}`;
                commitment: `0x${string}`;
                points: number;
              };
              return {
                kind: "commit" as const,
                player: a.player,
                // this is the whole pitch: what lands on chain is an opaque hash
                detail: `${a.commitment.slice(0, 18)}…`,
                key: `${log.transactionHash}-${log.logIndex}`,
                question: Number((log.args as {q: number}).q),
              };
            }),
            ...prev,
          ].slice(0, 14),
        );
      },
    });

    const unwatchReveal = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: "AnswerRevealed",
      pollingInterval: 400,
      onLogs: (logs) => {
        setFeed((prev) =>
          [
            ...logs.map((log) => {
              const a = log.args as {
                player: `0x${string}`;
                answer: number;
                points: number;
                correct: boolean;
              };
              return {
                kind: "reveal" as const,
                player: a.player,
                detail: `${CHOICE_LABELS[a.answer]} · ${a.correct ? `+${a.points}` : "0"}`,
                correct: a.correct,
                key: `${log.transactionHash}-${log.logIndex}`,
                question: Number((log.args as {q: number}).q),
              };
            }),
            ...prev,
          ].slice(0, 14),
        );
      },
    });

    return () => {
      unwatchCommit();
      unwatchReveal();
    };
  }, [quizId]);

  // ---------------------------------------------------------------- controls

  const create = useCallback(async () => {
    setError(null);
    try {
      setStatus("Sealing answers and creating the quiz…");
      // never roll straight into question 1 on a fresh quiz — the lobby is the
      // only window players have to join
      const {quizId: id} = await post("/api/host/create");
      setStatus(
        `Quiz #${id} created — answers are sealed on chain. Players can join now; press Run round to start.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [post]);

  /// The round is driven by the server, not by this tab.
  ///
  /// It used to run here, on a `setInterval`. Browsers throttle timers in
  /// background tabs to about one tick a minute, and the reveal window is 25
  /// blocks — roughly ten seconds. With host and players on one machine this tab
  /// is unfocused exactly while somebody is answering, so every reveal window
  /// shut before this loop ticked again and `revealHostAnswer` was never sent.
  ///
  /// So this is a remote control and a status light. There is no Stop: the
  /// driver is a one-shot that runs to settlement and stops on its own, and on
  /// serverless there is no shared process to send a stop signal to. Pressing
  /// Run round again is safe and is also the recovery move — the driver reads
  /// the chain to decide what is missing, so it resumes rather than repeats.
  const [starting, setStarting] = useState(false);

  const run = useCallback(async () => {
    if (quizId === null) return;
    setError(null);
    setStarting(true);
    try {
      const s = await post("/api/host/run", {quizId});
      setStatus(s.step);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [post, quizId]);

  /// Status comes from the chain, not from the server's memory. On serverless
  /// the instance that answers this poll is rarely the one driving the round, so
  /// anything held in memory would report "idle" for a round running fine.
  useEffect(() => {
    if (!token || quizId === null) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/host/run?quizId=${quizId}`, {
          headers: {"x-host-token": token},
          cache: "no-store",
        });
        if (!res.ok) return;
        const s = (await res.json()) as {step?: string};
        if (alive && s.step) setStatus(s.step);
      } catch {
        // the status light going dark must never take the round down with it
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token, quizId]);

  // ---------------------------------------------------------------- render

  const question =
    round.activeQuestion >= 0 ? meta?.questions[round.activeQuestion] : undefined;
  const commitLeft = blocksLeft(round.commitDeadline, round.block);
  const revealLeft = blocksLeft(round.revealDeadline, round.block);
  const inCommit = round.phase === Phase.COMMIT;
  const left = inCommit ? commitLeft : revealLeft;
  const total = inCommit
    ? round.quiz?.commitBlocks ?? COMMIT_BLOCKS
    : round.quiz?.revealBlocks ?? REVEAL_BLOCKS;
  const liveFeed = feed.filter((item) => item.question === round.activeQuestion);
  const roomCode = quizId === null ? null : roomCodeFor(quizId);
  const settled = !!round.quiz?.finalized;
  const pot = round.quiz?.pot ?? 0n;
  const prizePool = pot - (pot * RAKE_BPS) / 10_000n;

  return (
    <AppShell active="host">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-5 sm:px-8">
        {/* ------------------------------------------------------- controls */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Host a Game</h1>
            <a
              className="font-mono text-xs text-muted transition hover:text-action"
              href={explorerAddress(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              {short(CONTRACT_ADDRESS)} ↗
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <ThemeToggle />
            <input
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                localStorage.setItem("blitz.host.token", e.target.value);
              }}
              placeholder="host token"
              className="w-36 rounded-xl border border-border bg-surface-2 px-3 py-2.5 font-mono text-sm outline-none focus:border-action"
            />
            <Button variant="outline" onClick={create}>
              New quiz
            </Button>
            <Button
              variant="brand"
              onClick={run}
              disabled={settled || quizId === null || starting}
            >
              {settled ? "Round over" : starting ? "Starting…" : "Run round"}
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          <div className="flex flex-col gap-5">
            {/* ------------------------------------------- board or lobby */}
            {settled ? (
              <RoundOver
                roomCode={roomCode}
                leaderboard={round.leaderboard}
                pot={pot}
                prizePool={prizePool}
                totalScore={round.quiz?.totalScore ?? 0n}
              />
            ) : question ? (
              <div className="rounded-2xl border border-rail-3 bg-stage p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-rail-muted">
                      Question {round.activeQuestion + 1} of{" "}
                      {round.quiz?.questionCount ?? 5}
                    </span>
                    {roomCode && (
                      <span className="font-mono text-sm font-bold tracking-[0.2em] text-brand">
                        {roomCode}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-rail-muted">
                    <ClockIcon width={15} height={15} />
                    <span className={inCommit ? "text-brand" : "text-action"}>
                      {(left * 0.4).toFixed(1)}s
                    </span>
                    <span className="font-mono text-xs">· {left} blocks</span>
                  </span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-rail-3">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
                      inCommit ? "bg-brand" : "bg-action"
                    }`}
                    style={{
                      width: `${total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0}%`,
                    }}
                  />
                </div>

                <div className="mt-5 flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-black leading-tight text-rail-text sm:text-3xl">
                    {question.prompt}
                  </h2>
                  {inCommit ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand">
                      <LockIcon width={13} height={13} />
                      Sealed
                    </span>
                  ) : round.phase === Phase.REVEAL ? (
                    <span className="shrink-0 rounded-full border border-action/40 bg-action/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-action">
                      Revealing
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-rail-3 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rail-muted">
                      Scored
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {question.choices.map((choice, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 font-semibold ${
                        round.hostAnswer === i
                          ? "border-brand bg-brand/12 text-brand"
                          : "border-rail-3 bg-stage-2 text-rail-text"
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          round.hostAnswer === i
                            ? "bg-brand text-white"
                            : "border border-rail-3 text-rail-muted"
                        }`}
                      >
                        {CHOICE_LABELS[i]}
                      </span>
                      {choice}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-rail-3 bg-stage px-5 py-8 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
                    Room Code
                  </p>
                  <p className="font-mono text-5xl font-black tracking-[0.24em] text-brand">
                    {roomCode ?? "----"}
                  </p>
                </div>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt="Join QR code"
                    className="h-40 w-40 rounded-xl bg-white p-1.5"
                  />
                )}
                <p className="font-mono text-sm text-rail-muted">
                  {joinUrl.replace(/^https?:\/\//, "")}
                </p>
                <p className="text-sm text-rail-muted">
                  {round.quiz
                    ? `${round.leaderboard.length} in · pot ${formatEther(round.quiz.pot)} MON · entry ${formatEther(round.quiz.entryFee ?? ENTRY_FEE)} MON`
                    : "Press New quiz to seal the answers and open the room."}
                </p>
              </div>
            )}

            {/* ------------------------------------------------- live feed */}
            <Card>
              <div className="flex items-center justify-between">
                <Label>{inCommit ? "Incoming commits" : "Reveals"}</Label>
                <span className="font-mono text-xs text-muted">
                  block {round.block.toString()}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {inCommit
                  ? "Every answer on chain right now is an opaque hash. Nobody can read one — not the other players, not the host, not the mempool."
                  : "Openings are checked against the sealed hash before they score."}
              </p>
              <ul className="mt-3 max-h-56 space-y-1.5 overflow-hidden font-mono text-sm">
                {liveFeed.length === 0 && (
                  <li className="text-muted">waiting for transactions…</li>
                )}
                {liveFeed.map((item) => (
                  <li
                    key={item.key}
                    className="slide-in flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2"
                  >
                    <span className="text-muted">{short(item.player)}</span>
                    <span
                      className={
                        item.kind === "commit"
                          ? "text-action"
                          : item.correct
                            ? "text-brand-strong"
                            : "text-muted"
                      }
                    >
                      {item.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* -------------------------------------------------- side column */}
          <div className="flex flex-col gap-5">
            <Card>
              <div className="flex items-center justify-between">
                <Label>Leaderboard</Label>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <UsersIcon width={15} height={15} />
                  {round.leaderboard.length}
                </span>
              </div>
              <ol className="mt-3 space-y-1.5">
                {round.leaderboard.slice(0, 12).map((row, i) => (
                  <li
                    key={row.address}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      i === 0 && row.score > 0n
                        ? "border-brand/40 bg-brand/8"
                        : "border-border bg-surface-2"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
                      <span className="font-mono text-sm">{short(row.address)}</span>
                    </span>
                    <span className="font-mono text-sm font-bold text-brand-strong">
                      {row.score.toString()}
                    </span>
                  </li>
                ))}
                {round.leaderboard.length === 0 && (
                  <li className="text-sm text-muted">nobody has joined yet</li>
                )}
              </ol>
            </Card>

            <Card className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pot</Label>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold">
                  <BoltIcon className="text-action" width={16} height={16} />
                  {round.quiz ? Number(formatEther(round.quiz.pot)).toFixed(3) : "0.000"}
                </p>
              </div>
              <div>
                <Label>Players</Label>
                <p className="mt-1 text-2xl font-bold">{round.leaderboard.length}</p>
              </div>
              <div>
                <Label>Total score</Label>
                <p className="mt-1 text-2xl font-bold">
                  {round.quiz?.totalScore.toString() ?? "0"}
                </p>
              </div>
              <div>
                <Label>Status</Label>
                <p className="mt-1">
                  {settled ? (
                    <Pill tone="brand">Settled</Pill>
                  ) : round.quiz && round.quiz.nextQuestion > 0 ? (
                    <Pill tone="action">Live</Pill>
                  ) : (
                    <Pill>Lobby</Pill>
                  )}
                </p>
              </div>
            </Card>

            {status && !error && <Banner tone="info">{status}</Banner>}
            {error && <Banner tone="error">{error}</Banner>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/// The last question being scored is not the end of the round — the pot still
/// has to settle, and then players claim from their own screens. Leaving the
/// board on question 5 made a finished round look like a stuck one.
function RoundOver({
  roomCode,
  leaderboard,
  pot,
  prizePool,
  totalScore,
}: {
  roomCode: string | null;
  leaderboard: {address: `0x${string}`; score: bigint}[];
  pot: bigint;
  prizePool: bigint;
  totalScore: bigint;
}) {
  const podium = leaderboard.slice(0, 3);
  const medals = ["bg-brand text-white", "bg-rail-3 text-rail-text", "bg-warn/80 text-white"];
  return (
    <div className="rounded-2xl border border-rail-3 bg-stage px-5 py-7 text-center">
      <span className="pop-in mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand/15 text-brand">
        <TrophyIcon width={32} height={32} />
      </span>
      <h2 className="mt-4 text-3xl font-black tracking-tight text-rail-text">
        Round complete
      </h2>
      <p className="mt-1.5 text-sm text-rail-muted">
        The pot is settled. Payouts are pull-based — each player claims from their own
        screen{roomCode ? `, still on room ${roomCode}` : ""}.
      </p>

      <ol className="mx-auto mt-6 max-w-md space-y-2">
        {podium.map((row, i) => (
          <li
            key={row.address}
            className="flex items-center justify-between rounded-xl border border-rail-3 bg-stage-2 px-4 py-3"
          >
            <span className="flex items-center gap-3">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${medals[i]}`}
              >
                {i + 1}
              </span>
              <span className="font-mono text-sm text-rail-text">{short(row.address)}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-brand">
                {row.score.toString()} pts
              </span>
              <span className="font-mono text-xs text-rail-muted">
                {totalScore > 0n
                  ? `${Number(formatEther((prizePool * row.score) / totalScore)).toFixed(4)} MON`
                  : "refund"}
              </span>
            </span>
          </li>
        ))}
        {podium.length === 0 && (
          <li className="text-sm text-rail-muted">nobody scored — the pot refunds in full</li>
        )}
      </ol>

      <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2">
        {[
          {label: "Pot", value: Number(formatEther(pot)).toFixed(3)},
          {label: "Prize pool", value: Number(formatEther(prizePool)).toFixed(3)},
          {label: "Total score", value: totalScore.toString()},
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-rail-3 bg-stage-2 px-2 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-muted">
              {s.label}
            </p>
            <p className="mt-1 truncate text-lg font-black text-rail-text">{s.value}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-rail-muted">Press New quiz to open another room.</p>
    </div>
  );
}

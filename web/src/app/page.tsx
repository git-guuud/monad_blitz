"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {formatEther, keccak256, encodePacked, type Hex} from "viem";
import {explorerAddress, explorerTx, publicClient} from "@/lib/chain";
import {
  burnerAccount,
  clearSealed,
  loadSealed,
  randomSalt,
  saveSealed,
  sendBurnerTx,
  warmBurner,
} from "@/lib/burner";
import {Phase, readClaimed, readCommit, readJoined, readPayout} from "@/lib/read";
import {blocksLeft, useQuizMeta, useRound} from "@/lib/useRound";
import {roomCodeFor} from "@/lib/room-code";
import {
  CLAIM_COST,
  COMMIT_BLOCKS,
  ENTRY_FEE,
  FUNDING_FLOOR,
  GAS,
  QUESTION_COUNT,
  REVEAL_BLOCKS,
} from "@/lib/quiz-config";
import {AppShell, ThemeToggle, short} from "@/components/ui";
import {HomeScreen} from "@/components/player/HomeScreen";
import {JoinScreen} from "@/components/player/JoinScreen";
import {GameScreen} from "@/components/player/GameScreen";
import {ResultScreen} from "@/components/player/ResultScreen";
import {FinalScreen} from "@/components/player/FinalScreen";

type Sending = "idle" | "funding" | "joining" | "committing" | "revealing" | "claiming";

/// A commit is on chain but we cannot say what it was — no local salt (another
/// device, cleared storage) and not yet revealed. Better to highlight nothing
/// than to guess.
const UNKNOWN_ANSWER = -1;
/// Which screen of the design is on show. The chain decides what is *possible*;
/// this only decides what the player is currently looking at, so that leaving
/// the board to check the lobby never touches on-chain state.
type View = "home" | "join" | "game";

export default function PlayerPage() {
  const meta = useQuizMeta();
  const quizId = meta?.quizId ?? null;
  const round = useRound(quizId, 500, 4);

  const [address, setAddress] = useState<Hex | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [joined, setJoined] = useState(false);
  const [sending, setSending] = useState<Sending>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /// null until the player picks a screen, so the first render can fall back to
  /// whatever the chain says: a refresh mid-round lands back on the board, not
  /// in the lobby.
  const [chosenView, setView] = useState<View | null>(null);

  const [fetchedCommit, setCommitState] = useState<
    | {question: number; committed: boolean; revealed: boolean; points: number; answer: number}
    | null
  >(null);
  /// What the answer was worth at the instant it was tapped. Without this the
  /// display fell back to the live figure while the commit was in flight, so the
  /// player watched their points tick *down* after they had already answered.
  /// The chain replaces it once the commit lands and the real points are known.
  const [sealingAt, setSealingAt] = useState<{question: number; points: number} | null>(
    null,
  );
  const [payout, setPayout] = useState<bigint>(0n);
  const [claimed, setClaimed] = useState(false);

  // the join screen is only a waiting room: the moment the chain confirms the
  // entry fee landed, it becomes the board
  const view: View =
    joined && chosenView === "join" ? "game" : (chosenView ?? (joined ? "game" : "home"));

  const q = round.activeQuestion;
  const question = q >= 0 ? meta?.questions[q] : undefined;
  // stale state from the previous question must never show against this one
  const commitState = fetchedCommit?.question === q ? fetchedCommit : null;
  const pendingPoints = sealingAt?.question === q ? sealingAt.points : null;
  const revealing = useRef(false);
  /// Read inside the commit handler, which is defined above the point where
  /// `livePoints` is computed. A ref keeps the handler's identity stable rather
  /// than rebuilding it on every block.
  const livePointsRef = useRef(100);

  // ---------------------------------------------------------------- burner

  useEffect(() => {
    // the burner key lives in localStorage, so the address only exists after
    // hydration — deriving it during render would mismatch the server
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddress(burnerAccount().address);
  }, []);

  useEffect(() => {
    if (!address) return;
    publicClient.getBalance({address}).then(setBalance).catch(() => {});
  }, [address, round.chainBlock, sending]);

  useEffect(() => {
    if (!address || quizId === null) return;
    readJoined(quizId, address).then(setJoined).catch(() => {});
  }, [address, quizId, sending]);

  // per-question on-chain state for this player, refreshed each block
  useEffect(() => {
    if (!address || quizId === null || q < 0) return;
    readCommit(quizId, q, address)
      .then((c) => {
        const onChain = c.commitment !== `0x${"0".repeat(64)}`;
        const local = loadSealed(quizId, q);
        setCommitState({
          question: q,
          // a commit we have sent but that has not landed yet must stay locked
          // in, or the buttons unlock and the player double-commits
          committed: onChain || !!local,
          revealed: c.revealed,
          points: Number(c.points),
          // `Commit.answer` is written by `revealAnswer`, never by
          // `commitAnswer` — so between the commit landing and the buzzer it is
          // still zero, which is choice A. Reading it in that window made the
          // highlight jump off whatever the player picked and onto A.
          answer: c.revealed ? c.answer : (local?.answer ?? UNKNOWN_ANSWER),
        });
      })
      .catch(() => {});
  }, [address, quizId, q, round.chainBlock]);

  useEffect(() => {
    if (!address || quizId === null || !round.quiz?.finalized) return;
    // payoutOf reports 0 once claimed — hold the figure so the screen still
    // shows what the player won
    readPayout(quizId, address)
      .then((p) => setPayout((prev) => (p > 0n ? p : prev)))
      .catch(() => {});
    readClaimed(quizId, address).then(setClaimed).catch(() => {});
  }, [address, quizId, round.quiz?.finalized, sending]);

  // ---------------------------------------------------------------- actions

  /// Asks the host to drip gas in, and waits for it to be spendable. Monad
  /// validates against settled state, so a wallet funded in block N is still
  /// rejected as "insufficient balance" for a few blocks after.
  const topUp = useCallback(
    async (need: bigint) => {
      if (!address) return;
      let funded: {error?: string} | null = null;
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch("/api/fund", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({address}),
          });
          funded = await res.json();
          if (!funded?.error) break;
        } catch {
          // network blip between phone and host — retry
        }
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
      if (funded?.error) throw new Error(funded.error);

      setStatus("Waiting for funds to land…");
      for (let i = 0; i < 40; i++) {
        if ((await publicClient.getBalance({address})) >= need) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      setStatus(null);
    },
    [address],
  );

  const join = useCallback(async () => {
    if (quizId === null || !address) return;
    setError(null);
    try {
      setSending("funding");
      await topUp(FUNDING_FLOOR);
      setSending("joining");
      setLastTx(
        await sendBurnerTx({
          functionName: "join",
          args: [BigInt(quizId)],
          value: ENTRY_FEE,
          gas: GAS.join,
        }),
      );
      setJoined(true);
      setView("game");
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setSending("idle");
    }
  }, [address, quizId, topUp]);

  const commit = useCallback(
    async (answer: number) => {
      if (quizId === null || !address || q < 0) return;
      setError(null);
      try {
        setSending("committing");
        setSealingAt({question: q, points: livePointsRef.current});
        const salt = randomSalt();
        // the salt must be written down before the transaction goes out: if the
        // tab reloads after the commit lands but before we saved, the player
        // could never open their own answer
        saveSealed(quizId, q, {answer, salt});
        const commitment = keccak256(
          encodePacked(
            ["uint256", "uint8", "uint8", "bytes32", "address"],
            [BigInt(quizId), q, answer, salt, address],
          ),
        );
        // paint the lock-in immediately, then confirm behind it — the player
        // needs feedback inside one block, not one round trip
        setCommitState((c) => ({
          question: q,
          committed: true,
          revealed: false,
          points: c?.points ?? 0,
          answer,
        }));
        setLastTx(
          await sendBurnerTx({
            functionName: "commitAnswer",
            args: [BigInt(quizId), q, commitment],
            // explicit gas skips an estimateGas round trip; on a 400ms chain
            // that round trip is a real slice of the answer window, and the
            // commit block is what sets the score
            gas: GAS.commit,
          }),
        );
      } catch (e) {
        // Ask the chain before touching the salt. Dropping a salt for a commit
        // that actually landed makes it unopenable — the player would score
        // zero on an answer they got right — while keeping a salt for a commit
        // that never landed locks them out of answering at all.
        const landed = await readCommit(quizId, q, address)
          .then((c) => c.commitment !== `0x${"0".repeat(64)}`)
          .catch(() => true); // unsure: assume it landed, the safer error
        if (!landed) {
          clearSealed(quizId, q);
          setCommitState((c) => (c ? {...c, committed: false} : c));
          setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
        }
      } finally {
        setSending("idle");
      }
    },
    [address, q, quizId],
  );

  /// Auto-reveal the moment the buzzer goes. Waiting for a human to press a
  /// second button is how players end up scoring zero on answers they got right.
  useEffect(() => {
    if (quizId === null || q < 0 || round.phase !== Phase.REVEAL) return;
    if (!commitState?.committed || commitState.revealed || revealing.current) return;
    const sealed = loadSealed(quizId, q);
    if (!sealed) return;

    revealing.current = true;
    (async () => {
      try {
        setSending("revealing");
        setLastTx(
          await sendBurnerTx({
            functionName: "revealAnswer",
            args: [BigInt(quizId), q, sealed.answer, sealed.salt],
            gas: GAS.reveal,
          }),
        );
        setStatus(null);
      } catch (e) {
        // the effect re-fires every block, so a phase race or a dropped RPC
        // call just retries; only surface it once the window has actually shut
        if (round.phase === Phase.REVEAL) {
          setStatus("Retrying reveal…");
        } else {
          setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
        }
      } finally {
        setSending("idle");
        revealing.current = false;
      }
    })();
  }, [commitState, q, quizId, round.phase]);

  useEffect(() => {
    revealing.current = false;
  }, [q]);

  /// Re-warm the nonce and fee cache as each question opens, so the tap itself
  /// costs a signature and a send and nothing else. Also covers the burner
  /// being funded between rounds, which moves the nonce underneath us.
  useEffect(() => {
    if (!joined || q < 0) return;
    void warmBurner().catch(() => {});
  }, [joined, q]);

  const claim = useCallback(async () => {
    if (quizId === null || !address) return;
    setError(null);
    try {
      setSending("claiming");
      // `claim` is the only transaction that runs *after* a whole round of
      // spending, so it is the one that finds the burner empty — and because
      // Monad charges the full gas limit up front, an underfunded wallet cannot
      // even attempt it. Check before sending rather than surfacing a failure
      // to someone who has already won the money.
      if ((await publicClient.getBalance({address})) < CLAIM_COST) {
        setStatus("Topping up gas to claim…");
        await topUp(CLAIM_COST);
      }
      setLastTx(
        await sendBurnerTx({
          functionName: "claim",
          args: [BigInt(quizId)],
          gas: GAS.claim,
        }),
      );
      setClaimed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setSending("idle");
    }
  }, [address, quizId, topUp]);

  // ---------------------------------------------------------------- derived

  const roomCode = quizId === null ? null : roomCodeFor(quizId);
  const settled = !!round.quiz?.finalized;
  const players = round.leaderboard.length;
  const questionCount = round.quiz?.questionCount ?? QUESTION_COUNT;
  const entryFee = formatEther(round.quiz?.entryFee ?? ENTRY_FEE);

  const myScore = address
    ? round.leaderboard.find((r) => r.address.toLowerCase() === address.toLowerCase())?.score ?? 0n
    : 0n;
  const rank =
    address && myScore > 0n
      ? round.leaderboard.findIndex(
          (r) => r.address.toLowerCase() === address.toLowerCase(),
        ) + 1
      : null;

  const commitLeft = blocksLeft(round.commitDeadline, round.block);
  const revealLeft = blocksLeft(round.revealDeadline, round.block);
  const commitTotal = round.quiz?.commitBlocks ?? COMMIT_BLOCKS;
  const revealTotal = round.quiz?.revealBlocks ?? REVEAL_BLOCKS;

  const sealed = quizId !== null && q >= 0 ? loadSealed(quizId, q) : null;
  const picked =
    sealed?.answer ??
    (commitState?.revealed && commitState.answer !== UNKNOWN_ANSWER
      ? commitState.answer
      : null);
  const wasCorrect =
    round.hostAnswer !== null && commitState?.revealed
      ? commitState.answer === round.hostAnswer
      : null;

  /// Mirrors the contract: BASE 100, plus SPEED_BONUS scaled by the blocks still
  /// on the clock. `commitDeadline - block` is exactly the `remaining` the
  /// contract computes, so this is a preview, not an approximation.
  const livePoints =
    100 + Math.floor((100 * Math.min(commitLeft, commitTotal)) / (commitTotal || 1));

  useEffect(() => {
    livePointsRef.current = livePoints;
  }, [livePoints]);

  const handleCode = useCallback(
    (code: string) => {
      if (!/^\d{4}$/.test(code)) return "Room codes are four digits.";
      if (roomCode === null) return "No room is live yet — ask the host to create one.";
      if (code !== roomCode) return "No room with that code. Check the host screen.";
      if (settled) return "That round has already paid out. Ask the host for a new one.";
      setError(null);
      setView("join");
      return null;
    },
    [roomCode, settled],
  );

  const wallet = address
    ? {
        address: short(address),
        balance: `${Number(formatEther(balance)).toFixed(3)} MON`,
        href: explorerAddress(address),
      }
    : null;

  // ---------------------------------------------------------------- render

  const showFinal = joined && settled;
  const showResult =
    joined && !showFinal && view === "game" && !!commitState?.revealed && wasCorrect !== null;
  const showGame = joined && !showFinal && !showResult && view === "game";

  let screen: React.ReactNode;
  if (showFinal) {
    screen = (
      <FinalScreen
        payout={Number(formatEther(payout)).toFixed(4)}
        score={myScore.toString()}
        rank={rank}
        players={players}
        pot={round.quiz ? Number(formatEther(round.quiz.pot)).toFixed(3) : "0.000"}
        roomCode={roomCode ?? "----"}
        claimed={claimed}
        claiming={sending === "claiming"}
        onClaim={claim}
        error={error}
      />
    );
  } else if (showResult && commitState) {
    const last = q + 1 >= questionCount;
    screen = (
      <ResultScreen
        correct={!!wasCorrect}
        pointsEarned={commitState.points}
        speedBonus={Math.max(0, commitState.points - 100)}
        score={myScore.toString()}
        rank={rank}
        players={players}
        roomCode={roomCode ?? "----"}
        blocksLeft={revealLeft}
        blocksTotal={revealTotal}
        actionLabel={
          last
            ? "Settling the pot…"
            : revealLeft > 0
              ? `Next question in ${(revealLeft * 0.4).toFixed(1)}s`
              : "Starting next question…"
        }
      />
    );
  } else if (showGame && question) {
    screen = (
      <GameScreen
        roomCode={roomCode ?? "----"}
        players={players}
        questionIndex={q}
        questionCount={questionCount}
        prompt={question.prompt}
        choices={question.choices}
        phase={round.phase}
        blocksLeft={round.phase === Phase.COMMIT ? commitLeft : revealLeft}
        blocksTotal={round.phase === Phase.COMMIT ? commitTotal : revealTotal}
        picked={picked}
        hostAnswer={round.hostAnswer}
        committed={!!commitState?.committed}
        committing={sending === "committing"}
        livePoints={livePoints}
        lockedPoints={
          commitState?.committed ? commitState.points || pendingPoints : null
        }
        pointsConfirmed={!!commitState?.points}
        entryFee={entryFee}
        status={status}
        error={error}
        onPick={commit}
        onExit={() => setView("home")}
      />
    );
  } else if (showGame) {
    // joined, but the host has not started question 1 yet
    screen = <Lobby roomCode={roomCode ?? "----"} players={players} pot={round.quiz ? Number(formatEther(round.quiz.pot)).toFixed(3) : "0.000"} />;
  } else if (view === "join" && roomCode) {
    screen = (
      <JoinScreen
        roomCode={roomCode}
        host={meta?.host}
        players={players}
        entryFee={entryFee}
        questionCount={questionCount}
        status={status}
        error={error}
        busy={sending === "funding" ? "funding" : sending === "joining" ? "joining" : null}
        closed={(round.quiz?.nextQuestion ?? 0) > 0}
        onJoin={join}
        onCancel={() => setView("home")}
      />
    );
  } else {
    screen = (
      <HomeScreen
        roomCode={roomCode}
        settled={settled}
        entryFee={entryFee}
        players={players}
        liveGame={joined && !settled}
        onSubmitCode={handleCode}
        onResume={() => setView("game")}
        wallet={wallet}
      />
    );
  }

  const onStage = showGame || showResult || showFinal;

  return (
    <AppShell
      active={onStage || view === "join" ? "play" : "home"}
      balance={`${Number(formatEther(balance)).toFixed(2)} MON`}
      walletHref={address ? explorerAddress(address) : undefined}
      mobileRight={<ThemeToggle tone="dark" />}
    >
      {screen}
      <footer
        className={`flex items-center justify-between gap-3 px-5 py-2.5 text-[11px] sm:px-8 ${
          onStage ? "bg-stage text-rail-muted" : "border-t border-border text-muted"
        }`}
      >
        <span className="font-mono">block {round.block.toString()}</span>
        {lastTx && (
          <a
            className="font-mono text-action hover:underline"
            href={explorerTx(lastTx)}
            target="_blank"
            rel="noreferrer"
          >
            last tx {short(lastTx)} ↗
          </a>
        )}
      </footer>
    </AppShell>
  );
}

/// Between paying in and question 1. The join window closes the instant the host
/// starts, so this is the only moment the room can grow.
function Lobby({
  roomCode,
  players,
  pot,
}: {
  roomCode: string;
  players: number;
  pot: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-stage px-6 py-16 text-center text-rail-text">
      <span className="pulse grid h-16 w-16 place-items-center rounded-full bg-brand/15 text-brand">
        <span className="h-3 w-3 rounded-full bg-brand" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
          Room Code
        </p>
        <p className="font-mono text-4xl font-black tracking-[0.24em] text-brand">
          {roomCode}
        </p>
      </div>
      <h1 className="text-2xl font-black tracking-tight">You&apos;re in</h1>
      <p className="max-w-sm text-sm text-rail-muted">
        Waiting for the host to start question 1. Keep this screen open — your answers
        seal and open themselves.
      </p>
      <div className="flex gap-3">
        {[
          {label: "Players", value: players},
          {label: "Pot", value: `${pot} MON`},
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-rail-3 bg-stage-2 px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-muted">
              {s.label}
            </p>
            <p className="mt-0.5 text-lg font-black">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

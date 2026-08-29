import {parseEther} from "viem";

/// Contract parameters. Both windows are block-driven — never wall-clock — so the
/// UI can never disagree with the contract about whether the buzzer has gone.
/// Monad blocks are 400ms, so 25 + 25 blocks is a 10s answer window and a 10s
/// reveal. The same round on Ethereum would be ~10 minutes of dead air.
export const COMMIT_BLOCKS = 25;
/// Reveals all fire at once the instant the commit window shuts, but each one is
/// a signature, a send and a confirmation, and a lagging node can force a retry.
/// 25 blocks is 10 seconds of slack for a phase nobody has to watch.
export const REVEAL_BLOCKS = 25;
export const BLOCK_MS = 400;

export const ENTRY_FEE = parseEther("0.005");

/// Monad charges the full gas *limit*, not gas used, so every limit below is the
/// measured cost plus a small margin — an over-generous limit is money burned.
/// Measured with `forge test --gas-report`, plus the 21k intrinsic.
export const GAS = {
  join: 150_000n,
  commit: 110_000n,
  reveal: 125_000n,
  /// `claim` walks every question to total the score, so unlike the others it
  /// grows with the length of the round — and, less obviously, with how *well*
  /// the player did: a question they answered correctly costs a full Commit read
  /// plus the host's answer, one they skipped costs almost nothing.
  ///
  /// The old 70k + 20k/question gave 170,000 for a five-question round. Measured
  /// against a live round where the player answered nearly everything correctly,
  /// `claim` needs 189,670. So it fit a player who did badly and ran out of gas
  /// on one who did well — the better you played, the less likely you could
  /// collect. Sized here for the worst case, every question correct.
  claim: 160_000n + 18_000n * BigInt(questionCount()),
} as const;

/// Host limits are deliberately loose. viem estimates against current state, but
/// the host reveal runs *after* players have revealed, and by then the first
/// non-zero write to `totalScore` costs a cold SSTORE the estimate never saw —
/// an estimate used as the limit runs out of gas by exactly that much. The host
/// sends a dozen transactions per round, so the headroom is cheap insurance.
export const HOST_GAS: Record<string, bigint> = {
  createQuiz: 400_000n,
  startQuestion: 130_000n,
  revealHostAnswer: 250_000n,
  finalize: 120_000n,
};

function questionCount() {
  return Number(process.env.NEXT_PUBLIC_QUESTION_COUNT ?? 5);
}

/// How many of the questions to actually play. Gas is what limits the size of a
/// live round: the host has to fund every player's burner, and a full round is
/// join + two transactions per question + claim. At ~100 gwei that is roughly
/// 0.10 MON per player at 3 questions and 0.15 at 5, so this is the dial to turn
/// when the host key is thin. Set NEXT_PUBLIC_QUESTION_COUNT to override.
export const QUESTION_COUNT = questionCount();

/// What one player's whole round costs in gas, as a *limit* rather than a
/// spend: Monad charges the full limit on every transaction, so this is the real
/// money a burner must be holding, not an estimate it might come in under.
const ROUND_GAS =
  GAS.join + (GAS.commit + GAS.reveal) * BigInt(questionCount()) + GAS.claim;

/// Base fee assumption for sizing the drip. Measured around 100 gwei; sized
/// above it because being wrong low means a burner that cannot pay, and being
/// wrong high only means the host over-funds a wallet it can drain later.
const ASSUMED_GAS_PRICE = 130_000_000_000n; // 130 gwei

/// Retries burn the full limit every time — a reveal that goes out three times
/// costs three reveals. One spare question's worth is what stands between a
/// laggy RPC and a player who cannot claim what they won.
const RETRY_HEADROOM = GAS.commit + GAS.reveal;

/// The drip has to cover a whole round with headroom for a base-fee spike — a
/// burner that runs dry mid-round silently scores zero on answers it got right.
///
/// This was a flat 0.18 MON, and it was too tight to be safe: a five-question
/// round costs about 0.1575 MON at 100 gwei, leaving under 0.023 of slack — less
/// than two reveal retries. The transaction that then found the wallet empty was
/// always `claim`, because it is the only one that runs *after* a full round of
/// spending. Players finished a round they had won and could not collect.
export const BURNER_FUNDING =
  ENTRY_FEE + (ROUND_GAS + RETRY_HEADROOM) * ASSUMED_GAS_PRICE;

/// Top up below this rather than refusing outright, so a player who runs low
/// between questions can be rescued mid-round.
export const FUNDING_FLOOR = BURNER_FUNDING / 2n;

/// What `claim` alone needs on hand. The client checks the burner against this
/// before claiming and tops up if it is short.
export const CLAIM_COST = GAS.claim * ASSUMED_GAS_PRICE;

export const RAKE_BPS = 500n;

export type PublicQuestion = {
  prompt: string;
  choices: string[];
};

export type QuizState = {
  quizId: number;
  questions: PublicQuestion[];
  entryFee: string;
  commitBlocks: number;
  revealBlocks: number;
};

export const CHOICE_LABELS = ["A", "B", "C", "D"] as const;

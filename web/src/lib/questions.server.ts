import {QUESTION_COUNT, type PublicQuestion} from "./quiz-config";

/// Server-only. The `answer` field never reaches the browser — the client is
/// served `publicQuestions()` instead. The host's answers are additionally
/// sealed on chain at createQuiz, so the host cannot change them later either.
export type Question = PublicQuestion & {answer: number};

const ALL_QUESTIONS: Question[] = [
  {
    prompt: "How long is a block on Monad?",
    choices: ["12 seconds", "2 seconds", "400 milliseconds", "1 minute"],
    answer: 2,
  },
  {
    prompt: "What sits in a public mempool and ruins a naive on-chain quiz?",
    choices: [
      "Your unencrypted answer",
      "The block hash",
      "The gas price",
      "The nonce",
    ],
    answer: 0,
  },
  {
    prompt: "HQ Trivia peaked above a million players. What killed it?",
    choices: [
      "Running out of questions",
      "Paying out millions of tiny prizes",
      "A hostile takeover by chess",
      "Too few hosts",
    ],
    answer: 1,
  },
  {
    prompt: "Why must a commitment hash include msg.sender?",
    choices: [
      "To save gas",
      "So the explorer can decode it",
      "So nobody can copy your commit and replay your reveal",
      "It doesn't — it's decorative",
    ],
    answer: 2,
  },
  {
    prompt: "In a pari-mutuel pot, your payout is proportional to…",
    choices: [
      "Your share of the total score",
      "How much gas you burned",
      "Your wallet age",
      "Alphabetical order",
    ],
    answer: 0,
  },
];

/// The questions actually played this round. Trimming the round is the cheapest
/// way to fit more players into a fixed amount of host MON.
export const QUESTIONS: Question[] = ALL_QUESTIONS.slice(0, QUESTION_COUNT);

export function publicQuestions(): PublicQuestion[] {
  return QUESTIONS.map(({prompt, choices}) => ({prompt, choices}));
}

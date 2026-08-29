import {publicQuestions} from "@/lib/questions.server";
import {readActiveQuizId, readQuiz} from "@/lib/read";
import {fail} from "../_auth";

export const dynamic = "force-dynamic";

/// The client never receives the correct answers — only prompts and choices.
export async function GET() {
  try {
    const quizId = await readActiveQuizId();
    if (quizId === null) {
      return Response.json({quizId: null, questions: publicQuestions()});
    }
    const quiz = await readQuiz(quizId);
    return Response.json({
      quizId,
      questions: publicQuestions(),
      entryFee: quiz.entryFee.toString(),
      commitBlocks: quiz.commitBlocks,
      revealBlocks: quiz.revealBlocks,
      questionCount: quiz.questionCount,
      nextQuestion: quiz.nextQuestion,
      finalized: quiz.finalized,
      host: quiz.host,
    });
  } catch (e) {
    return fail(e);
  }
}

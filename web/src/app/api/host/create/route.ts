import {QUESTIONS} from "@/lib/questions.server";
import {hostCommitment, hostWrite} from "@/lib/host.server";
import {readNextQuizId} from "@/lib/read";
import {COMMIT_BLOCKS, ENTRY_FEE, REVEAL_BLOCKS} from "@/lib/quiz-config";
import {checkHostToken, fail, timed} from "../../_auth";

export const dynamic = "force-dynamic";

/// The host seals every answer here, before a single player has joined. That is
/// what stops the host picking the "correct" answer after seeing the commits.
export async function POST(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const quizId = await readNextQuizId();
    const commitments = QUESTIONS.map((question, q) =>
      hostCommitment(quizId, q, question.answer),
    );
    const {hash} = await timed("create", {quiz: quizId}, () =>
      hostWrite({
        functionName: "createQuiz",
        args: [BigInt(quizId), commitments, ENTRY_FEE, COMMIT_BLOCKS, REVEAL_BLOCKS],
      }),
    );
    return Response.json({quizId, hash});
  } catch (e) {
    return fail(e);
  }
}

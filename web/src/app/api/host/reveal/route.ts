import {QUESTIONS} from "@/lib/questions.server";
import {hostSalt, hostWrite} from "@/lib/host.server";
import {checkHostToken, fail, timed} from "../../_auth";

export const dynamic = "force-dynamic";

/// Opens the host's sealed answer. The contract checks it against the commitment
/// made at createQuiz, so this can only ever be the answer chosen up front.
export async function POST(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const {quizId, q} = await req.json();
    const index = Number(q);
    const {hash} = await timed("reveal", {quiz: quizId, q: index}, () =>
      hostWrite({
        functionName: "revealHostAnswer",
        args: [
          BigInt(quizId),
          index,
          QUESTIONS[index].answer,
          hostSalt(Number(quizId), index),
        ],
      }),
    );
    return Response.json({hash, answer: QUESTIONS[index].answer});
  } catch (e) {
    return fail(e);
  }
}

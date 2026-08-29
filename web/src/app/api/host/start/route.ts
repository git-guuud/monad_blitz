import {hostWrite} from "@/lib/host.server";
import {checkHostToken, fail, timed} from "../../_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const {quizId, q} = await req.json();
    const {hash} = await timed("start", {quiz: quizId, q: Number(q)}, () =>
      hostWrite({
        functionName: "startQuestion",
        args: [BigInt(quizId), Number(q)],
      }),
    );
    return Response.json({hash});
  } catch (e) {
    return fail(e);
  }
}

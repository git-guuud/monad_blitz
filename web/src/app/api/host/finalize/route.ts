import {hostWrite} from "@/lib/host.server";
import {checkHostToken, fail, timed} from "../../_auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const {quizId} = await req.json();
    const {hash} = await timed("finalize", {quiz: quizId}, () =>
      hostWrite({functionName: "finalize", args: [BigInt(quizId)]}),
    );
    return Response.json({hash});
  } catch (e) {
    return fail(e);
  }
}

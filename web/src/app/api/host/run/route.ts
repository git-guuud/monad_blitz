import {after} from "next/server";
import {driveRound, roundStatus} from "@/lib/round-runner.server";
import {checkHostToken, fail} from "../../_auth";

export const dynamic = "force-dynamic";

/// A five-question round is ~100 seconds of wall clock. 300s is the ceiling on
/// every Vercel plan (Hobby's default *and* maximum), so this fits with room for
/// a longer round, and work handed to `after()` shares the same limit.
export const maxDuration = 300;

/// Stopped a little short of the ceiling. Being cut off mid-transaction leaves a
/// nonce spent against a receipt nobody read; finishing early leaves a round
/// that another Run round resumes cleanly.
const DRIVE_BUDGET_MS = 270_000;

/// Kicks off the round driver and answers immediately.
///
/// `after()` — Next's replacement for `waitUntil` since 15.1 — keeps the work
/// alive past the response, which is what lets a ~100s round run without the
/// host's browser holding a request open for the whole thing. It shares the
/// function's `maxDuration`, hence the budget above.
///
/// The driver is idempotent: it reads the chain to decide what to do next, so
/// pressing this twice is harmless and pressing it after a timeout resumes.
export async function POST(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const {quizId} = await req.json();
    const id = Number(quizId);
    if (!Number.isInteger(id) || id < 0) {
      return Response.json({error: "bad quizId"}, {status: 400});
    }
    const status = await roundStatus(id);
    if (status.settled) return Response.json(status);

    after(async () => {
      try {
        await driveRound(id, DRIVE_BUDGET_MS);
      } catch {
        // driveRound logs its own failures; never let this reject unhandled
      }
    });
    return Response.json({...status, step: "starting…"});
  } catch (e) {
    return fail(e);
  }
}

/// Chain-derived, so every instance gives the same answer.
export async function GET(req: Request) {
  const denied = checkHostToken(req);
  if (denied) return denied;
  try {
    const quizId = Number(new URL(req.url).searchParams.get("quizId"));
    if (!Number.isInteger(quizId) || quizId < 0) {
      return Response.json({error: "bad quizId"}, {status: 400});
    }
    return Response.json(await roundStatus(quizId));
  } catch (e) {
    return fail(e);
  }
}

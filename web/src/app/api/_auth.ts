import "server-only";

/// Host control is a public URL during the demo. Without this, anyone in the room
/// could finalize the round out from under the game.
export function checkHostToken(req: Request): Response | null {
  const expected = process.env.HOST_TOKEN;
  if (!expected) {
    return Response.json(
      {error: "HOST_TOKEN is not set on the server — see web/.env.example"},
      {status: 500},
    );
  }
  if (req.headers.get("x-host-token") !== expected) {
    return Response.json({error: "bad host token"}, {status: 401});
  }
  return null;
}

export function fail(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({error: message}, {status});
}

/// Host actions are time-critical and fail on a 25-block window, but until now
/// they failed *silently* on the server — the only trace was a toast on the host
/// screen that the next poll overwrote. When a round stalls, the server log is
/// the first place anyone looks, so every host action leaves one line in it.
export function logHost(action: string, detail: Record<string, unknown>) {
  const bits = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === "bigint" ? v.toString() : v}`)
    .join(" ");
  console.log(`[host] ${new Date().toISOString()} ${action} ${bits}`);
}

/// viem writes the useful part of a revert on the *second* line — the first is
/// only "The contract function X reverted with the following reason:". Taking
/// `split("\n")[0]`, as this did, threw the reason away and logged the header,
/// which made a stall unreadable in exactly the moment the log existed for. It
/// also broke callers that match on the reason text: an "already done" revert
/// stopped being recognised as success.
export function describeError(e: unknown, max = 300) {
  const raw = e instanceof Error ? e.message : String(e);
  const flat = raw.replace(/\s*\n\s*/g, " | ").replace(/\s{2,}/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/// Wraps a host action so its duration and outcome are always logged. Duration
/// is the number that matters: a reveal has ~10s of window, so a call that
/// succeeds in 8s is one bad block away from being the failure.
export async function timed<T>(
  action: string,
  detail: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const out = await fn();
    logHost(`${action} ok`, {...detail, ms: Date.now() - started});
    return out;
  } catch (e) {
    logHost(`${action} FAILED`, {
      ...detail,
      ms: Date.now() - started,
      error: describeError(e),
    });
    throw e;
  }
}

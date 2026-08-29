import {isAddress, type Hex} from "viem";
import {publicClient} from "@/lib/chain";
import {hostSend} from "@/lib/host.server";
import {BURNER_FUNDING, FUNDING_FLOOR} from "@/lib/quiz-config";
import {fail} from "../_auth";

export const dynamic = "force-dynamic";

/// Drips gas into a player's burner so they never see a wallet popup. Refuses an
/// address that already has enough, which is what stops this being a faucet to
/// drain — a burner can only ever be topped up to the amount one round costs.
export async function POST(req: Request) {
  try {
    const {address} = await req.json();
    if (!isAddress(address)) {
      return Response.json({error: "not an address"}, {status: 400});
    }
    const balance = await publicClient.getBalance({address: address as Hex});
    if (balance >= FUNDING_FLOOR) {
      return Response.json({
        funded: false,
        reason: "already funded",
        balance: balance.toString(),
      });
    }

    // top up to the target, never a flat send — that caps what any one address
    // can ever pull out of the host key
    const hash = await hostSend(
      {to: address as Hex, value: BURNER_FUNDING - balance},
      10,
      // asked only before a nonce-collision retry: if a concurrent request
      // already funded this burner, stop rather than send a second transfer
      async () =>
        (await publicClient.getBalance({address: address as Hex})) >= FUNDING_FLOOR,
    );
    return Response.json({funded: true, hash, concurrent: hash === null});
  } catch (e) {
    return fail(e);
  }
}

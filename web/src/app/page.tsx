"use client";

import {useEffect, useState} from "react";
import {
  useAccount,
  useBalance,
  useBlockNumber,
  useConnect,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {injected} from "wagmi/connectors";
import {formatUnits} from "viem";
import {activeChain, explorerTx} from "@/lib/wagmi";
import {CONTRACT_ABI, CONTRACT_ADDRESS} from "@/lib/contract";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function Home() {
  const {address, isConnected, chainId} = useAccount();
  const {connect} = useConnect();
  const {disconnect} = useDisconnect();
  const {data: balance} = useBalance({address});
  const {data: blockNumber} = useBlockNumber({watch: true});

  const deployed = CONTRACT_ADDRESS !== ZERO;
  const wrongChain = isConnected && chainId !== activeChain.id;

  const {data: count, refetch} = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "number",
    query: {enabled: deployed},
  });

  const {writeContract, data: hash, isPending, error} = useWriteContract();
  const {isLoading: confirming, isSuccess} = useWaitForTransactionReceipt({hash});

  // Time the round-trip — a nice thing to say out loud during the demo.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    if (hash && sentAt === null) setSentAt(Date.now());
    if (isSuccess && sentAt !== null && elapsed === null) {
      setElapsed(Date.now() - sentAt);
      refetch();
    }
  }, [hash, isSuccess, sentAt, elapsed, refetch]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8 font-mono text-sm">
      <header>
        <h1 className="font-sans text-2xl font-semibold">Monad Blitz scaffold</h1>
        <p className="opacity-60">
          {activeChain.name} · chain {activeChain.id} · block{" "}
          {blockNumber ? blockNumber.toString() : "…"}
        </p>
      </header>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        {!isConnected ? (
          <button
            className="rounded bg-foreground px-4 py-2 text-background"
            onClick={() => connect({connector: injected()})}
          >
            Connect wallet
          </button>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="break-all">{address}</div>
            <div className="opacity-60">
              {balance
                ? `${Number(formatUnits(balance.value, balance.decimals)).toFixed(4)} ${balance.symbol}`
                : "…"}
            </div>
            {wrongChain && (
              <div className="text-amber-600">
                Wrong network — switch to {activeChain.name}.
              </div>
            )}
            <button className="mt-2 self-start underline opacity-60" onClick={() => disconnect()}>
              disconnect
            </button>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        {!deployed ? (
          <p className="opacity-70">
            No contract yet. Run <code>make deploy-testnet</code> in <code>contracts/</code>, then
            paste the address into <code>src/lib/contract.ts</code>.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              on-chain value: <span className="text-lg">{count?.toString() ?? "…"}</span>
            </div>
            <button
              className="self-start rounded bg-foreground px-4 py-2 text-background disabled:opacity-40"
              disabled={!isConnected || wrongChain || isPending || confirming}
              onClick={() => {
                setSentAt(null);
                setElapsed(null);
                writeContract({
                  address: CONTRACT_ADDRESS,
                  abi: CONTRACT_ABI,
                  functionName: "increment",
                });
              }}
            >
              {isPending ? "confirm in wallet…" : confirming ? "mining…" : "increment"}
            </button>
            {elapsed !== null && <div className="opacity-70">confirmed in {elapsed} ms</div>}
            {hash && (
              <a
                className="underline opacity-70"
                target="_blank"
                rel="noreferrer"
                href={explorerTx(chainId ?? activeChain.id, hash)}
              >
                view transaction
              </a>
            )}
            {error && <div className="text-red-500">{error.message.slice(0, 200)}</div>}
          </div>
        )}
      </section>
    </main>
  );
}

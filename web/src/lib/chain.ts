import {createPublicClient, http} from "viem";
import {monadTestnet} from "viem/chains";

export const activeChain = monadTestnet;

/// The public RPC drops requests under load, and a dropped commit is a player
/// scoring zero on an answer they got right. Every client retries.
export function transport() {
  return http(undefined, {retryCount: 4, retryDelay: 120, timeout: 20_000});
}

/// 40 phones polling round state at 400ms blocks is a lot of RPC. Multicall
/// batching folds each tick's reads into a single request.
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: transport(),
  batch: {multicall: {wait: 50}},
});

export function explorerTx(hash: string) {
  return `https://testnet.monadscan.com/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `https://testnet.monadscan.com/address/${address}`;
}

import {createConfig, http, cookieStorage, createStorage} from "wagmi";
import {monad, monadTestnet} from "wagmi/chains";
import {injected} from "wagmi/connectors";

// Flip to `monad` (chain 143) for the mainnet-deploy bonus (25 pts).
export const activeChain = monadTestnet;

export const config = createConfig({
  chains: [monadTestnet, monad],
  connectors: [injected()],
  ssr: true,
  storage: createStorage({storage: cookieStorage}),
  transports: {
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz"),
    [monad.id]: http("https://rpc.monad.xyz"),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export function explorerTx(chainId: number, hash: string) {
  const base =
    chainId === monad.id
      ? "https://monadscan.com"
      : "https://testnet.monadscan.com";
  return `${base}/tx/${hash}`;
}

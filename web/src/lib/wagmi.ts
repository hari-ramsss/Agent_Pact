import { getDefaultConfig } from "connectkit";
import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";

const appName = "AgentPact";

const rpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName,
    chains: [sepolia],
    transports: {
      [sepolia.id]: http(rpcUrl),
    },
  })
);

# AgentPact

**Trustless escrow and dispute resolution for AI-to-AI work contracts.**

When one AI agent hires another, there is no trust layer — no court, no record,
no consequence for failure. AgentPact is that missing layer.

Built for ETHGlobal Open Agents 2026.

---

## Vision

AI agents will increasingly hire, evaluate, and depend on each other. Today, there is no neutral enforcement layer for that work. AgentPact creates a pact between two agents:

- Agent A funds a task in USDC.
- Agent B accepts the task and locks a bond.
- Agent B submits work with an immutable 0G Storage URI.
- If there is a dispute, only KeeperHub can execute the final verdict.
- Passing agents receive payment, their bond back, and GOODREP.
- Failing agents lose their bond, which is routed into BADREP.

This creates an on-chain memory of agent reliability that future employers can inspect before hiring.

## The problem

AI agents are beginning to hire each other. There is currently no:
- Escrow mechanism to lock payment until work is verified
- Dispute resolution system that doesn't require a human
- On-chain reputation that follows an agent across all future contracts
- Consequence for an agent that submits bad work

## The solution

AgentPact combines escrow, automated dispute execution, and reputation into one flow:

| Layer | Technology | What it does |
|---|---|---|
| Escrow | AgentPact.sol (Sepolia) | Locks USDC payment + worker bond |
| Arbitration | 0G Compute (qwen/qwen-2.5-7b-instruct) | Autonomous 5-step LLM verdict |
| Reputation | $BADREP (Uniswap v3) + $GOODREP (Uniswap v4) | Permanent on-chain consequence |
| Automation | KeeperHub + OpenClaw | Zero-human execution of verdicts |

---

## Architecture

```
Employer Agent                    Worker Agent
      │                                │
      │──── createPact() ──────────────┤
      │     (USDC locked in escrow)    │──── acceptPact() (bond locked)
      │                                │──── submitWork() (Gensyn gate)
      │──── raiseDispute()             │
      │                                │
      ▼                                │
ArbitrationRequested event            │
      │                                │
      ▼                                │
Arbitrator Agent (0G Compute)         │
  1. Fetch task spec (0G Storage)      │
  2. Fetch submission (0G Storage)     │
  3. 5-step LLM reasoning loop        │
  4. Write verdict (0G Storage Log)   │
  5. Trigger KeeperHub                │
      │                                │
      ▼                                │
resolveDispute() ← KeeperHub          │
      │                                │
  PASS: payment + bond → worker ───────┘
        $GOODREP minted, score +10
        v4 hook: swap fees → yield vault
        
  FAIL: payment → employer
        bond → Uniswap v3 swap → $BADREP → worker
        score -20
```

---

## Contracts (Sepolia)

| Contract | Address | Purpose |
|---|---|---|
| AgentPact | `0x67A558657840c8b1058279c530f480B80d33b399` | Core escrow + dispute |
| BadRepToken | `0x42cc96E731d5bD1d85A1Cc776a6849ba98780332` | $BADREP ERC-20 |
| GoodRepToken | `0xEFb22830a822c19DE18A2c7a7bA1d4475c9cAAB7` | $GOODREP non-transferable |
| GoodRepYieldHook | `0xf17B5E9c99350ae371C981a7ba24de5A1C290a18` | Uniswap v4 fee routing |
| AgentPactRegistry | `0x5e30A8d53481Ae597B8F7683cD0befa90Ba02e55` | Open agent registry |
| MockSwapRouter | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` | Real Uniswap v3 swap implementation |
| V4PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | Uniswap v4 Pool Manager (testnet) |

---

## Setup & Deployment

Follow these instructions to deploy the contracts to Sepolia and run the autonomous agent demo.

### 1. Install Dependencies

You will need [Foundry](https://getfoundry.sh/) and Node.js (v18+) installed.

```bash
git clone https://github.com/[yourhandle]/agentpact
cd agentpact

# Install Node dependencies
npm install

# Install Foundry dependencies
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge install foundry-rs/forge-std --no-git
forge install Uniswap/v3-periphery --no-git
forge install Uniswap/v3-core --no-git
forge install Uniswap/v4-periphery --no-git
```

*(Note: If your Foundry version does not support `--no-git`, run the commands without that flag.)*

### 2. Environment Setup

You will need Sepolia ETH for gas and Sepolia USDC for escrow. You can get testnet ETH from [sepoliafaucet.com](https://sepoliafaucet.com/) and testnet USDC from the [Circle Faucet](https://faucet.circle.com/).

Create a `.env` file in the root directory (you can copy from `.env.example` if available):

```env
# Your deployer private key (no 0x prefix)
PRIVATE_KEY=your_deployer_private_key

# Sepolia RPC — get from Alchemy or Infura
SEPOLIA_RPC_URL=your_alchemy_or_infura_rpc

# Etherscan for verification (get from etherscan.io)
ETHERSCAN_API_KEY=your_etherscan_key

# KeeperHub
KEEPERHUB_ADDRESS=0x354B0792FA080806BE1bab97DA0bc83d6D29bbfb
KEEPERHUB_API_URL=https://app.keeperhub.com/api
KEEPERHUB_API_KEY=your_keeperhub_api_key
KEEPERHUB_WEBHOOK_KEY=your_keeperhub_webhook_key
KEEPERHUB_WEBHOOK_URL=your_keeperhub_webhook_url
KEEPER_PRIVATE_KEY=your_keeper_private_key
ARBITRATOR_REPLAY_BLOCKS=9

# 0G Compute
OG_COMPUTE_STRICT=false
OG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct
OG_COMPUTE_KEY=your_0g_compute_key
OG_COMPUTE_URL=https://compute-network-6.integratenetwork.work/v1/proxy

# Deployed Contracts (filled in after deployment)
AGENTPACT_ADDRESS=
BADREP_TOKEN_ADDRESS=
GOODREP_TOKEN_ADDRESS=
REGISTRY_ADDRESS=
MOCK_SWAP_ROUTER=
V4_POOL_MANAGER=
GOODREP_YIELD_HOOK=

# Agent Wallets
AGENT_A_PRIVATE_KEY=employer_agent_key
AGENT_A_ADDRESS=employer_agent_address
AGENT_B_PRIVATE_KEY=worker_agent_key
AGENT_B_ADDRESS=worker_agent_address

# 0G Network (Galileo Testnet)
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
OG_KV_RPC=http://178.238.236.119:6789
OG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
OG_STREAM_ID=0xa9e6f7c58b804bb2a517f8e8fc44e9e0ad1d516f6d92ee0b3c2d7ea4a66f8c21
OG_STORAGE_MOCK=false
```

### 3. Deploy to Sepolia

Deploy the escrow contract, reputation tokens, and Uniswap hooks to the Sepolia testnet:

```bash
source .env
forge script script/Deploy.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  -vvvv
```

Once deployed, copy the printed contract addresses (`AGENTPACT_ADDRESS`, `BADREP_TOKEN_ADDRESS`, etc.) into your `.env` file.

### 4. Run the Demo

Open two terminal windows. 

**Terminal 1: Start the Autonomous Arbitrator**
This agent runs persistently, listening to Sepolia for dispute events, executing LLM reasoning on 0G Compute, and writing verdicts to 0G Storage.
```bash
npm run arbitrator
```

**Terminal 2: Run the Lifecycle Demo**
This script simulates the entire agent-to-agent workflow: pact creation, USDC escrow, Gensyn relevance gating, dispute generation, and trustless KeeperHub resolution.
```bash
# Run the happy path (generates $GOODREP)
npm run demo

# Or run the failing path (slashes bond, mints $BADREP via Uniswap v3)
npm run demo:bad
```

### 5. Run the Frontend Dashboard

We have built a beautiful, real-time UI to visualize the pact lifecycle and agent reputations.

```bash
# Open a new terminal window
cd web
npm install
npm run dev
```

Open your browser to `http://localhost:3000` to interact with the live dashboard!
---

## Tech stack

- **Smart contracts**: Solidity ^0.8.20, Foundry
- **Automation**: KeeperHub, OpenClaw connector
- **Decentralized storage**: 0G Storage, 0G KV, 0G Storage Log
- **Arbitration LLM**: 0G Compute (qwen/qwen-2.5-7b-instruct)
- **Reputation tokens**: Uniswap v3 Router ($BADREP swap) + Uniswap v4 Hook ($GOODREP yield)
- **Relevance gate**: Gensyn embedding similarity
- **Off-chain**: TypeScript, ethers.js, @0gfoundation/0g-ts-sdk

---

## Repository structure

```
agentpact/
├── src/                          Solidity contracts
│   ├── AgentPact.sol             Core escrow + dispute logic
│   ├── BadRepToken.sol           $BADREP ERC-20
│   ├── GoodRepToken.sol          $GOODREP non-transferable ERC-20
│   ├── GoodRepYieldHook.sol      Uniswap v4 hook
│   ├── AgentPactRegistry.sol     Open agent registry
│   ├── mocks/                    MockSwapRouter, MockPoolManager
│   └── interfaces/               ISwapRouter, IGoodRepYieldHook
├── test/                         Foundry tests (7 passing)
├── scripts/                      TypeScript off-chain scripts
│   ├── arbitrator/               Autonomous arbitrator agent
│   ├── demo/                     Live demo script
│   ├── og-storage.ts             0G Storage utilities
│   ├── og-kv.ts                  0G KV utilities
│   ├── gensyn-gate.ts            Embedding relevance gate
│   └── create-pact.ts            Full pact creation flow
├── packages/
│   ├── openclaw-keeperhub/       KeeperHub FA2 connector
│   └── agentpact-sdk/            SDK for agent integrations
├── web/                          Next.js Frontend UI Dashboard
│   ├── src/app/                  Frontend pages & components
│   └── package.json              Frontend dependencies
├── Dockerfile                    Container for 0G Compute deployment
└── FEEDBACK.md                   Uniswap prize required artifact
```

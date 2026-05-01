# AgentPact

AgentPact is a trustless escrow and reputation protocol for AI-agent work. It lets one agent hire another, lock payment and bond on-chain, store task evidence on 0G Storage, and resolve disputes through a KeeperHub-controlled execution path.

The core idea is simple: good work should build portable reputation, and failed work should leave an economic scar.

## Vision

AI agents will increasingly hire, evaluate, and depend on each other. Today, there is no neutral enforcement layer for that work. AgentPact creates a pact between two agents:

- Agent A funds a task in USDC.
- Agent B accepts the task and locks a bond.
- Agent B submits work with an immutable 0G Storage URI.
- If there is a dispute, only KeeperHub can execute the final verdict.
- Passing agents receive payment, their bond back, and GOODREP.
- Failing agents lose their bond, which is routed into BADREP.

This creates an on-chain memory of agent reliability that future employers can inspect before hiring.

## How It Solves The Problem

AgentPact combines escrow, automated dispute execution, and reputation into one flow:

- **Trustless payment**: funds are locked before work begins.
- **Worker accountability**: the worker posts a bond sized by their credit score.
- **Immutable evidence**: task specs, submissions, and verdict records are stored through 0G URIs.
- **Restricted execution**: only KeeperHub can call `resolveDispute()`, so neither party can force the outcome.
- **Reputation consequences**: successful work mints GOODREP; failed work produces BADREP.
- **Uniswap integration**: BADREP punishment uses a v3-style swap path, while GOODREP rewards use a v4-style yield hook for demo/testnet.

## Technical Overview

Main contracts:

- `src/AgentPact.sol`: escrow, pact lifecycle, dispute resolution, credit score updates.
- `src/GoodRepToken.sol`: non-transferable reward reputation token.
- `src/BadRepToken.sol`: visible punishment reputation token.
- `src/GoodRepYieldHook.sol`: v4-style hook that accrues yield to GOODREP holders.
- `src/mocks/MockSwapRouter.sol`: testnet/demo replacement for the Uniswap v3 router.
- `src/mocks/MockPoolManager.sol`: testnet/demo replacement for a Uniswap v4 pool manager.

Supporting scripts:

- `script/Deploy.s.sol`: deploys and wires the contracts.
- `scripts/og-storage.ts`: helpers for 0G Storage upload/download.
- `scripts/og-kv.ts`: helpers for 0G KV score/history storage.

## Local Setup

Install dependencies:

```bash
npm install
forge install Uniswap/v3-periphery --no-git
forge install Uniswap/v3-core --no-git
```

If your Foundry version does not support `--no-git`, run the `forge install` commands without that flag.

Create a `.env` file:

```env
PRIVATE_KEY=
SEPOLIA_RPC_URL=
KEEPERHUB_ADDRESS=

AGENTPACT_ADDRESS=
BADREP_TOKEN_ADDRESS=
GOODREP_TOKEN_ADDRESS=
MOCK_SWAP_ROUTER=
V4_POOL_MANAGER=
GOODREP_YIELD_HOOK=
REGISTRY_ADDRESS=

OG_COMPUTE_URL=https://api.0g.compute/v1
OG_COMPUTE_KEY=
OG_COMPUTE_MODEL=qwen3:7b
OG_COMPUTE_STRICT=false
KEEPER_PRIVATE_KEY=
AGENT_B_PRIVATE_KEY=
USDC_ADDRESS=
GENSYN_API_URL=https://api.gensyn.ai/v1
GENSYN_API_KEY=
KEEPERHUB_API_URL=
KEEPERHUB_API_KEY=
KEEPERHUB_WEBHOOK_URL=
```

Build and test:

```bash
forge build
forge test -vvv
node node_modules/typescript/bin/tsc --noEmit
```

Run the arbitrator agent:

```bash
npm run arbitrator
```

If `OG_COMPUTE_KEY` is not funded or the 0G Compute endpoint is temporarily unavailable, the arbitrator automatically falls back to deterministic mock inference so the long-running agent, 0G Storage/KV memory, audit log, and on-chain resolution path can still be demonstrated. Set `OG_COMPUTE_STRICT=true` to require real 0G Compute and fail instead of falling back.

Trigger the local/testnet e2e arbitration flow:

```bash
npm run test:e2e
```

Run the Day 9 ecosystem helpers:

```bash
npm run openclaw
npm run sdk:demo
```

Deploy to Sepolia:

```bash
source .env
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast -vvv
```

After deployment, copy the printed contract addresses into `.env`.

## Current Status

The current implementation supports the full hackathon/testnet demo path:

- pact creation, acceptance, submission, dispute, and KeeperHub-only resolution
- BADREP swap path through a mock v3-compatible router
- GOODREP reward minting
- v4-style GOODREP yield accrual and claiming
- 0G Storage/KV helper scripts for evidence and reputation data
- autonomous 0G Compute arbitrator listener with 0G audit logs and KeeperHub resolution
- AgentPactRegistry, OpenClaw/KeeperHub connector, Gensyn relevance gate, and SDK stub for ecosystem integrations

The real Uniswap v4 HookMiner/CREATE2 deployment path can be added later when targeting a production v4 deployment.

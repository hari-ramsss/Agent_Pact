# AgentPact — Feedback & Prize Track Submission

This document contains the required feedback for the Uniswap prize tracks and the technical approach write-up for the KeeperHub prize tracks.

---

## 1. Uniswap Builder Experience & Feedback
**Prize Track: Uniswap Dual Primitive**

### Our Approach
AgentPact utilizes Uniswap in both directions to create a complete economic lifecycle for AI agents:
1.  **Economic Punishment ($BADREP)**: Slashed bonds from failing agents are swapped via Uniswap v3 (USDC → WETH) on Sepolia to prove real-world execution. The received amount is then used to mint a corresponding amount of non-transferable `$BADREP`.
2.  **Reputation Yield ($GOODREP)**: We built a Uniswap v4 hook (`GoodRepYieldHook.sol`) that routes 10% of swap fees from specific agent-to-agent pools into a yield vault accessible only to agents with high `$GOODREP` balances.

### Feedback on the Builder Experience
*   **What Worked Well**: 
    *   The `ISwapRouter` interface is a masterpiece of composability. Once we pivoted to using the liquid USDC/WETH pool on Sepolia, the integration was seamless.
    *   The v4 Hook lifecycle is incredibly powerful. The `afterSwap` hook allowed us to implement reputation-based yield redistribution in under 50 lines of code.
*   **What Didn't Work / DX Friction**: 
    *   **Testnet Liquidity Cold Start**: Bootstrapping a new v3 pool on Sepolia for a hackathon token is extremely difficult. We initially hit a "wall" trying to swap USDC directly for a custom `$BADREP` token due to zero liquidity. We pivoted to using WETH as a proxy, which worked but added complexity.
    *   **V4 Hook Deployment**: Mining the correct address prefix for hooks (HookMiner) is a significant friction point for developers not used to Foundry-heavy workflows.
*   **Missing Features / Suggestions**:
    *   **Testnet Pool Faucet**: We wish there was a Uniswap-provided tool or "Liquidity Faucet" that could instantly spin up a pool with dummy liquidity for any custom ERC20 against USDC. This would make testing economic cycles (like slashing/swapping) 10x faster.
    *   **Hook Templates**: More non-Foundry-based (e.g., Hardhat or pure Viem) templates for v4 hooks would help broaden the developer base.

---

## 2. KeeperHub Approach & OpenClaw Connector
**Prize Tracks: KeeperHub FA1 + FA2**

### Technical Approach
AgentPact uses KeeperHub as the ultimate source of truth for dispute resolution. Our approach centers on **Zero-Human Intervention (ZHI)**:
1.  **FA1 Implementation**: We utilize the `onlyKeeperHub` modifier on our `resolveDispute()` function. This ensures that only the autonomous Arbitrator (triggered by the KeeperHub engine) can move funds in the escrow contract after a dispute is raised. 
2.  **FA2 - OpenClaw Connector**: We built a dedicated connector (`packages/openclaw-keeperhub`) that implements the OpenClaw job registration lifecycle. It registers three specific jobs: `arbitration_requested`, `dispute_resolved`, and `pact_created`.

### How KeeperHub is Used
*   **Trigger Mechanism**: When an agent raises a dispute, the `ArbitrationRequested` event is picked up by KeeperHub.
*   **Execution Engine**: KeeperHub acts as the trusted relayer that executes the Arbitrator's verdict on-chain. It handles the gas management and transaction reliability, allowing our Arbitrator to focus solely on the 5-step LLM reasoning loop on 0G Compute.
*   **Registry Sync**: We use KeeperHub's webhook delivery system to keep the `AgentPactRegistry` synchronized across different subgraphs and UI instances.

---

## 3. 0G Network Integration
**Prize Track: 0G Storage Track 2**

### 0G Compute (Arbitrator Reasoning)
*   **Model**: `qwen/qwen-2.5-7b-instruct` running on 0G Compute.
*   **Logic**: A 5-step autonomous reasoning loop (Parse → Analyze → Identify → Confidence → Verdict).
*   **Verifiability**: Each step of the reasoning loop is written to 0G Storage Log for full auditability.

### 0G Storage & KV
*   **Task Specs & Submissions**: Stored as immutable blobs on 0G Storage.
*   **Chain of Custody**: URIs and Keccak256 hashes are stored on Sepolia, with the content retrieved by the Arbitrator directly from 0G Storage nodes.
*   **Agent Memory**: Persistent history and credit scores are stored in 0G KV, providing the Arbitrator with "reputation context" for every wallet.

---

## Protocol Statistics (Live Sepolia)
*   **AgentPact**: `0x67A558657840c8b1058279c530f480B80d33b399`
*   **BadRepToken**: `0x42cc96E731d5bD1d85A1Cc776a6849ba98780332`
*   **GoodRepToken**: `0xEFb22830a822c19DE18A2c7a7bA1d4475c9cAAB7`
*   **GoodRepYieldHook**: `0xf17B5E9c99350ae371C981a7ba24de5A1C290a18`
*   **AgentPactRegistry**: `0x5e30A8d53481Ae597B8F7683cD0befa90Ba02e55`
*   **MockSwapRouter**: `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` (Real v3 implementation)


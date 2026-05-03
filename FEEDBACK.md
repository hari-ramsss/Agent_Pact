# AgentPact — Uniswap Feedback

## Integration approach
We use Uniswap in two directions:
1. $BADREP: slashed USDC swapped via Uniswap into a permanent reputation token
2. $GOODREP: Uniswap v4 hook routes swap fees from AgentPact pools into a yield vault

## Friction points encountered
- **Testnet Liquidity Cold Start**: We initially planned to swap the slashed USDC directly for our `$BADREP` token via the Uniswap V3 Router. However, bootstrapping a new V3 pool on Sepolia just for a hackathon demo token was a massive friction point and introduced demo reliability risks.
- **Solution/Pivot**: To maintain a strict, real-world Uniswap integration without the cold start problem, we pivoted. We now swap the slashed USDC for WETH using the already-liquid Sepolia USDC/WETH pool. We then use the received WETH amount as the oracle/signal to mint `$BADREP` proportionally.

## What worked well
- **Router Composability**: The `ISwapRouter` `exactInputSingle` interface is incredibly straightforward. Once we pivoted to using the real USDC/WETH Sepolia pool, the swap executed flawlessly on-chain.
- **Hook Flexibility**: Designing a v4 hook for `$GOODREP` yield was surprisingly intuitive. The `afterSwap` lifecycle is perfect for reputation-based fee redistribution.

## Suggestions for Uniswap team
- **Testing Utility**: A canonical "Uniswap Testnet Liquidity Faucet" or CLI tool that instantly spins up a V3 pool with dummy liquidity for a custom ERC20 against a major asset (like Sepolia USDC) would drastically speed up hackathon development.
- **V4 Documentation**: More clear examples of hook address-prefix mining (HookMiner) in simple script formats would be helpful for non-foundry native users.

## Uniswap Integration - Days 5-6

### v3: WETH Swap & $BADREP Minting (Economic Punishment)
- Contract: `AgentPact.sol` -> `_executeFail()`
- When a dispute resolves against a worker agent, their bond is slashed.
- The slashed USDC is swapped through the **real Uniswap V3 Sepolia Router** into WETH, proving real on-chain execution and composability.
- The WETH output amount is then used to mint `$BADREP` proportionally (e.g., 1 WETH out = 1000 BADREP).
- Pool fee: 0.3% (`POOL_FEE = 3000`).
- This guarantees a real swap execution against a live Sepolia pool rather than relying on a mock router.

### v4: $GOODREP Yield Hook (Passive Reward)
- Contract: GoodRepYieldHook.sol
- Hook behavior: afterSwap-style fee accounting.
- Every simulated swap in a GOODREP pool calculates the pool fee and routes 10% of that fee into pro-rata yield accounting for $GOODREP holders.
- Honest agents earn passive yield from protocol activity. Slashed agents earn none unless they have earned $GOODREP through successful pacts.
- Yield sync: GoodRepToken.mint() calls hook.updateYield() before balances change to prevent accounting drift.
- Testnet/demo: MockPoolManager triggers the hook path without requiring live Uniswap v4 Sepolia deployments.

### Why dual direction matters
AgentPact uses Uniswap in both directions: punishment via v3-style BADREP swaps and reward via v4-style GOODREP yield accrual. Both paths are on-chain, KeeperHub-triggered, and visible through emitted events.

## 0G Compute Integration - Days 7-8

### Arbitrator Agent
- Persistent autonomous TypeScript agent designed for 0G Compute or local demo execution.
- Wallet address: configured through KEEPER_PRIVATE_KEY / KeeperHub execution wallet.
- Model: `qwen/qwen-2.5-7b-instruct` by default through an OpenAI-compatible 0G Compute endpoint.
- Real 0G Compute remains the primary path when OG_COMPUTE_KEY is available. If the key is missing or the endpoint fails, the agent falls back to deterministic mock inference for demos; set OG_COMPUTE_STRICT=true to disable fallback.

### 5-Step Reasoning Loop
1. Parse Requirements - extracts exact task requirements from the stored spec.
2. Analyze Submission - maps each requirement to YES/PARTIAL/NO.
3. Identify Critical Failures - isolates blocking failures.
4. Confidence Score - produces a 0-100 self-assessment.
5. Final Verdict - emits a single PASS/FAIL decision.

### 0G Storage Integration
- Task specs: fetched from 0G Storage via the URI stored on Sepolia.
- Submissions: fetched from 0G Storage via the URI stored on Sepolia.
- Verdict records: full JSON reasoning trace written back to 0G Storage.
- Audit trail: each reasoning step is uploaded as an append-style audit entry.

### 0G KV Integration
- Agent history is stored per agent in 0G KV.
- Credit score cache remains available through the existing KV helpers.

### Chain of custody
Task spec -> 0G Storage -> hash on Sepolia -> Arbitrator reads 0G -> verdict to 0G Storage -> URI written on-chain through resolveDispute().

## Day 9 - Ecosystem Layer

### AgentPactRegistry
- Open on-chain registry for AI agents.
- Deployed at: [REGISTRY_ADDRESS]
- Any agent can register with a 0G Storage metadata URI.
- Tracks total pacts per agent, last pact ID, and active status.

### KeeperHub FA2 - OpenClaw Connector
- Package: packages/openclaw-keeperhub.
- Registers 3 OpenClaw job specs: arbitration_requested, dispute_resolved, pact_created.
- Delivers webhooks on each event when KEEPERHUB_WEBHOOK_URL is configured.
- Logs manual registration payloads when KeeperHub API credentials are unavailable.

### Gensyn Relevance Gate
- Embedding similarity check before submitWork() in the e2e submission path.
- Threshold: 0.65 cosine similarity by default.
- Fallback mock embedding when Gensyn API is unavailable.
- Advisory mode on testnet, blocking-ready for mainnet.

### agentpact-sdk
- Package: packages/agentpact-sdk.
- TypeScript SDK with createPact, acceptPact, submitWork, raiseDispute, checkRep, getPact, and getBondRequired.
- Any AI agent can integrate AgentPact without manually assembling contract calls.

# AgentPact — Uniswap Feedback

## Integration approach
We use Uniswap in two directions:
1. $BADREP: slashed USDC swapped via Uniswap into a permanent reputation token
2. $GOODREP: Uniswap v4 hook routes swap fees from AgentPact pools into a yield vault

## Friction points encountered
(fill this in as you build — required for prize eligibility)

## What worked well
(fill this in as you build)

## Suggestions for Uniswap team
(fill this in as you build)

## Uniswap Integration - Days 5-6

### v3: $BADREP Swap (Economic Punishment)
- Contract: AgentPact.sol -> _executeFail()
- When a dispute resolves against a worker agent, their bond is slashed.
- The slashed USDC is swapped through an exactInputSingle-compatible router from USDC to $BADREP.
- $BADREP lands directly in the penalized agent's wallet as a visible reputation scar.
- Pool fee: 0.3% (POOL_FEE = 3000).
- Testnet/demo: MockSwapRouter mirrors the v3 router interface and mints at the same 1 USDC -> 1e12 BADREP rate used by the original stub.

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
- Model: qwen3:7b by default through an OpenAI-compatible 0G Compute endpoint.
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

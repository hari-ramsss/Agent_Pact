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

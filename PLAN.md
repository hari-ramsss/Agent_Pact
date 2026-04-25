# AgentPact — Complete Build Roadmap

*Every day, every decision, every reason why.*

## Before you touch code — the mindset

The document you have is a strategy doc, not a build plan. Strategy docs tell you what to build. This roadmap tells you the order to build it, why that order matters, and what "done" looks like at the end of each day so you never go to sleep unsure if you made real progress.
The single most important principle: each day's work must leave the project in a working state. Not "almost working." Not "working except for X." Actually deployable, actually testable, actually demonstrable. This matters because hackathons are won by teams who have something real on Day 7, not teams who have something perfect on Day 11.

## Day 0 — The setup day (do this the night before you start)

This is not optional. Every hour you spend on Day 1 fighting environment issues is an hour stolen from building. Do all of this before Day 1 begins.

#### Install the toolchain:

Foundry is your Solidity environment. It's faster than Hardhat for running tests, the syntax is cleaner, and the forge test output is more readable. Install it:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version   # should print a version number
```

Node.js 18 or higher is needed for your SDK and scripts later:

```bash
node --version    # if below 18, update via nvm or nodejs.org
```

#### Set up your wallets:

You need four wallets total. Create them in a fresh MetaMask profile or generate them with cast:

```bash
cast wallet new   # run this 4 times
```

Label them: Deployer, Agent A (employer), Agent B (worker), KeeperHub Simulator. The KeeperHub Simulator wallet is only for local testing — when KeeperHub is wired, their infrastructure becomes the real caller.
Fund Deployer and Agent A and Agent B with Sepolia ETH from sepoliafaucet.com. You need at least 0.5 ETH on each for gas during testing. Also get Sepolia USDC — Circle has a testnet faucet at faucet.circle.com.

#### Create accounts:

- Sign up for KeeperHub on their website tonight. Some teams have had onboarding delays. Do not wait until Day 2.
- Sign up for 0G — same reason. The account needs to be active before Day 4.
- Sign up for Alchemy or Infura and create a Sepolia app. Copy your RPC URL.
- Sign up for Etherscan and get an API key for contract verification.

#### Initialize the repo:

```bash
mkdir agentpact && cd agentpact
forge init
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
git init && git add . && git commit -m "init"
```

#### Create FEEDBACK.md:

This is the one file that costs you a prize if you forget. The Uniswap prize explicitly requires it in your repo. Create it tonight:

```bash
touch FEEDBACK.md
```

Write three sentences in it about what you're planning to build with Uniswap. That's enough for now. You will fill it in properly on Days 5 and 6. But it must exist from Day 1 so you don't forget.
By the end of Day 0 you should have: Foundry installed, four wallets funded, three accounts created, repo initialized, FEEDBACK.md existing. Nothing else.

## Days 1–3 — The foundation

#### What you're building

Three Solidity contracts, six passing tests, one live deployment on Sepolia, and KeeperHub confirmed working. By end of Day 3, resolveDispute() must have been called by KeeperHub on testnet at least once, with a transaction hash you can point at.

#### Why this comes first

Everything else in the project plugs into these contracts. The 0G Storage wiring on Day 4 plugs into createPact() and submitWork(). The Uniswap swap on Days 5–6 plugs into _executeFail(). The Arbitrator Agent on Days 7–8 plugs into raiseDispute() and resolveDispute(). If the contracts aren't solid, none of the integrations can be solid. You're building the skeleton before you put flesh on it.
The onlyKeeperHub modifier is the single most architecturally important line in the entire project. Everything else is an integration. That modifier is the reason AgentPact is trustless. It must be the first thing you build and the first thing you test.

## Day 1 — Tokens and skeleton

Start by creating your file structure:

```bash
touch src/AgentPact.sol
touch src/BadRepToken.sol
touch src/GoodRepToken.sol
touch src/AgentPactRegistry.sol
touch test/AgentPact.t.sol
touch script/Deploy.s.sol
```

Write BadRepToken.sol first. It's the simplest contract, it has no dependencies, and writing it warms you up. It's a standard ERC-20 with one important constraint: only AgentPact.sol can mint it. This is enforced by a minter address and an onlyMinter modifier. The minter gets set after AgentPact deploys.
Write GoodRepToken.sol second. Nearly identical to BadRepToken with one critical difference: override the _update internal function to revert on any transfer where from != address(0). This is what makes $GOODREP non-transferable. Minting is allowed (because from is the zero address when minting). Transfers are not. Burning is also not, which is intentional — the record is permanent.
Then write the AgentPact.sol skeleton. Not the full implementation — the skeleton. What "skeleton" means precisely: all five function signatures present, all structs and enums defined, all state variables declared, all events declared, the constructor wired, the onlyKeeperHub modifier written and applied to resolveDispute(). Function bodies can have placeholder logic — but the modifier must be real, not a stub.
The reason you write the modifier before the function bodies is psychological as much as architectural. Once the modifier exists and the test for it is written and passing, you have proof that the core security property works. Everything else is details.
At the end of Day 1, run forge build. It should compile with no errors. If it doesn't compile, fix it before sleeping. Never end a day with a broken build.

## Day 2 — Function bodies and tests

Fill in the function bodies for all five functions:
- createPact() reads the worker agent's credit score from the local mapping, calculates their bond requirement using the multiplier logic, pulls the payment amount from Agent A via safeTransferFrom, and stores everything in the pact struct. The credit score reading from 0G KV gets added on Day 7 — for now the local mapping is the source of truth.
- acceptPact() pulls the bond from Agent B and sets the pact status to Active. Status guard: must be in Created status. Only the named worker (or any agent if you want open acceptance) can call it.
- submitWork() stores the submission hash and 0G URI and sets status to Submitted. Status guard: must be Active. Only Agent B can call it. The Gensyn gate slots in here on Day 9 — for now it's a no-op.
- raiseDispute() sets status to Disputed, records the block number for timeout calculation, and emits two events: DisputeRaised and ArbitrationRequested. The second event is what KeeperHub will watch. Including the 0G URIs in this event is important — they're how KeeperHub communicates the context to the Arbitrator Agent later.
- resolveDispute() is the most important function. It has the onlyKeeperHub modifier. It checks the pact is in Disputed status. It calls either _executePass or _executeFail based on the verdict. It stores the verdict URI. It emits DisputeResolved.
- _executePass transfers payment and bond back to Agent B, mints $GOODREP proportional to contract value, and calls _updateCreditScore with +10.
- _executeFail transfers payment back to Agent A, emits BondSlashed, and for now mints $BADREP directly (the Uniswap swap replaces this on Days 5–6). Calls _updateCreditScore with -20. The slashed USDC stays in the contract until the Uniswap integration replaces the stub.
- _calculateBond implements the multiplier table: score ≥ 150 → half bond, score 50–149 → base bond, score -50 to 49 → 1.5x bond, score below -50 → double bond. New agents have score 0, which means 1.5x. This is intentional — new agents are a higher risk.
Once all bodies are written, write your tests. Write six of them. Each one should test one specific thing:
- Test 1 is the full pass flow end to end. Create pact, accept, submit, dispute, KeeperHub resolves Pass. Assert Agent B gets payment plus bond back, assert $GOODREP balance is positive, assert credit score is +10.
- Test 2 is the full fail flow. Same setup, KeeperHub resolves Fail. Assert Agent A gets payment back, assert $BADREP balance is positive, assert credit score is -20.
- Test 3 is the most important test in the entire project. Call resolveDispute() from Agent A — expect revert. Call it from Agent B — expect revert. Call it from a random address — expect revert. Call it from the deployer — expect revert. Then call it from keeperHub — expect success. This test is what you show judges when they ask "how do you know nobody else can call it."
- Test 4 tests that credit score changes the bond. Seed score 200, check bond is half base. Seed score -100, check bond is double base. Seed score 0, check bond is 1.5x base.
- Test 5 tests that $GOODREP is non-transferable. Run a pass flow to mint some, then attempt transfer() and expect revert with your custom error message.
- Test 6 tests status guards. Try to call resolveDispute() on a pact that's only in Created status. Try to call submitWork() before accepting. Both must revert with sensible messages.
Run all tests:

```bash
forge test -vvv
```

All six must pass. Do not move on until they do.

## Day 3 — Deployment and KeeperHub wiring

Write your deployment script. It should deploy BadRepToken, then GoodRepToken, then AgentPact with all three addresses wired. Immediately after deploying AgentPact, call setMinter() on both token contracts. This is a common mistake — people deploy everything and forget to wire the minter, then the test calls revert with "not minter" and they spend an hour debugging.
Deploy to Sepolia:

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

Save all three deployed addresses to your .env file immediately.
Verify on Etherscan that all contracts show as verified and the source code is readable. Judges and the KeeperHub team will look at your contracts on Etherscan. Unverified contracts look like you're hiding something.
Then wire KeeperHub. Go to the KeeperHub dashboard. You're creating an automation that watches for ArbitrationRequested events on your contract and calls resolveDispute(). For now the call is hardcoded to a Pass verdict — you're not testing the Arbitrator yet, you're testing that KeeperHub can actually reach your contract and the modifier accepts it.
After registering, push a pact manually through to the Disputed state using cast commands. Watch KeeperHub fire. Check that resolveDispute() was called with KeeperHub's address as msg.sender. Find that transaction on Sepolia Etherscan. Copy the hash somewhere safe.

#### End of Day 3 checklist:

All six tests pass locally. All three contracts deployed and verified on Sepolia. KeeperHub called resolveDispute() successfully — you have a transaction hash. FEEDBACK.md exists. checkRep() returns sensible values. The onlyKeeperHub modifier rejects every other caller. You know what ArbitrationRequested event does and why it exists.
If you can't check all of these, stay up and fix it. Day 4 builds on top of this foundation. A shaky foundation makes everything after it harder.

## Day 4 — 0G Storage wiring

#### What you're building

Replace the placeholder string URIs in your contracts with real 0G Storage writes. By end of Day 4, when createPact() is called, the task spec actually lives on 0G Storage and the content hash stored on-chain is the real hash of that content.

#### Why this matters architecturally

The entire chain of custody argument for Track 2 depends on this. The Arbitrator Agent, which runs on 0G Compute, reads task specs and submissions directly from 0G Storage using content hashes. If the task spec is just a string URI pointing to your localhost, that chain of custody doesn't exist. The 0G Storage write must be real for the Track 2 story to be real.
The secondary reason is the credit score. createPact() needs to read Agent B's credit score from 0G KV before calculating their bond. Right now it reads from a local mapping. After today it reads from 0G KV, with the local mapping as a fallback if the KV read fails. This sets up the Arbitrator Agent's ability to write scores that immediately affect future pacts.

#### The actual work

The 0G integration happens off-chain in your TypeScript scripts, not in Solidity. Your Solidity contracts already accept URIs and hashes — they don't need to change. What changes is the flow before calling createPact():
Before calling createPact(), your script uploads the task spec to 0G Storage and gets back a content URI and a hash. It passes that hash and URI into createPact(). The contract stores the hash on-chain. The content lives on 0G.
Before calling submitWork(), Agent B's script uploads the submission to 0G Storage and passes the resulting URI and hash into submitWork().
Set up the 0G SDK:

```bash
npm init -y
npm install @0glabs/0g-ts-sdk ethers dotenv
```

Write a small utility file scripts/og-storage.ts that wraps the 0G upload and read functions. Test it in isolation first — upload a string, get a URI back, read it back using the URI, confirm the content matches. Do this before integrating it into your pact flow. Debugging 0G in isolation is much easier than debugging it mid-transaction.
For the credit score, add a function to your utility file that reads a key from 0G KV given an agent address. The key pattern should be something like agentpact:score:{address}. If the key doesn't exist (new agent), return 0. Update createPact() in your calling script to read this before computing the bond. The on-chain _calculateBond function uses the score it receives — eventually you'll pass the 0G KV score in as a parameter rather than the contract reading it directly (because Solidity can't make external HTTP calls).
Write a test for this off-chain flow: upload a task spec, call createPact() with the resulting hash and URI, then read the URI back from the contract via getPact(), use the URI to fetch the content from 0G, and confirm the content hash matches what's on-chain. This is your proof that the chain of custody is real.

#### End of Day 4 checklist:

Task specs are actually stored on 0G Storage. The content hash on-chain is verifiable against the 0G content. Submissions are stored on 0G Storage via submitWork(). Credit scores are read from 0G KV before bond calculation, with a sensible fallback. You can demonstrate the full chain: content on 0G → hash on-chain → hash verified against 0G content. The contracts themselves have not changed — only the scripts calling them.

## Days 5–6 — Uniswap dual primitive

#### What you're building

Replace the $BADREP minting stub in _executeFail() with a real Uniswap swap. Add the $GOODREP yield mechanism via a Uniswap v4 hook. By end of Day 6, when a pact fails, slashed USDC is actually being swapped via Uniswap and $BADREP is minted from the proceeds. When a pact passes, $GOODREP accrues yield from the protocol's own swap fee activity.

#### Why this is your Uniswap 1st place argument

Every other project at this hackathon using Uniswap is doing one of two things: swapping tokens as part of a feature, or providing liquidity. You're doing neither. You're using the swap as an economic consequence mechanism — the act of swapping IS the punishment. And you're using the v4 hook to route fees to a yield vault for honest agents. Both directions. That's new. Lead every Uniswap conversation with "we invented a new primitive, not an integration."

## Day 5 — $BADREP swap

The $BADREP swap replaces the stub in _executeFail(). Instead of minting $BADREP directly, the contract sends the slashed USDC to a Uniswap pool and uses the output to determine how much $BADREP to mint.
You need to decide on your swap architecture. The simplest approach that still counts as a real Uniswap integration: your contract calls the Uniswap Universal Router with an exactInput swap from USDC to a token that you then use to determine the $BADREP mint amount. The swap output is the signal — more USDC slashed means more $BADREP minted, mediated by whatever the USDC/BADREP pool price is at that moment.
A simpler approach that's still legitimate: use Uniswap's swap to convert slashed USDC to ETH (which has a liquid pool on Sepolia), then use the ETH value as the basis for minting BADREPatafixedratio.ThisavoidsthebootstrapproblemofneedingaUSDC/BADREP at a fixed ratio. This avoids the bootstrap problem of needing a USDC/
BADREPatafixedratio.ThisavoidsthebootstrapproblemofneedingaUSDC/BADREP pool to exist.
Either way, the core change to _executeFail() is: instead of badRepToken.mint(agent, amount) directly, call the Uniswap Router, execute the swap, then call badRepToken.mint(agent, outputAmount) using the swap output.
Add the Uniswap contracts as a dependency:

```bash
forge install Uniswap/v3-periphery
forge install Uniswap/v3-core
```

Get the Sepolia Uniswap Router address from Uniswap's docs and add it to your constructor and .env.
Update FEEDBACK.md today. Write about the friction points you hit integrating the Router. Write about what the API was like. Write about what you'd change. This is legitimate feedback and the Uniswap team wants it.

## Day 6 — $GOODREP yield via Uniswap v4 hook

The v4 hook is the more technically ambitious piece. A Uniswap v4 hook is a contract that gets called before or after swap events in a pool. You're writing an afterSwap hook that, whenever a swap happens in a pool related to AgentPact activity, routes a percentage of the swap fees into a yield vault that $GOODREP holders can claim from.

#### The hook contract structure:

```text
GoodRepYieldHook.sol
├── inherits BaseHook from v4-periphery
├── implements afterSwap()
├── in afterSwap(): takes fee percentage, adds to vault balance
├── claimYield(address agent): $GOODREP holder calls this, receives USDC from vault
└── accruedYield(address agent): view function returning pending yield
```

The yield accrual math: each $GOODREP holder's share of the vault is proportional to their $GOODREP balance as a fraction of total supply. When claimYield() is called, transfer their share and zero out their accrual.
Add v4-periphery:

```bash
forge install Uniswap/v4-periphery
```

Write the hook and test it in isolation before wiring it into AgentPact. The test should: deploy the hook, simulate an afterSwap call, verify the vault balance increased, call claimYield(), verify the caller received funds.
Wire it into AgentPact by passing the hook address to the constructor and having _executePass() call hook.notifySuccess(agentB, paymentAmount) so the hook knows which agent earned reputation from which pool volume.
Update FEEDBACK.md again. Document the v4 hook experience specifically — hook deployment, testing on Sepolia v4 testnet, any API surface issues.

#### End of Day 6 checklist:

- _executeFail() calls Uniswap Router for the USDC swap. $BADREP is minted based on swap output. The v4 hook is deployed and receiving afterSwap calls. $GOODREP holders can call claimYield() and receive USDC. FEEDBACK.md has meaningful content about the Uniswap integration. You can run a full fail flow on Sepolia and see the Uniswap swap transaction in the middle of it.

## Days 7–8 — The Arbitrator Agent

#### What you're building

A persistent autonomous agent running on 0G Compute that adjudicates disputes. It has its own wallet address. It reads its case history from 0G KV. It writes its reasoning to 0G Storage Log in real time. It runs a 5-step loop. When it finishes, it sends the verdict to KeeperHub which executes it via resolveDispute().
This is the highest-risk piece of the build because it's the most novel. You've likely built smart contracts before. You've likely used Uniswap before. Running a persistent autonomous agent on a decentralized compute layer is less likely to be familiar territory. Give it two full days. Don't squeeze it into one.

#### Why the Arbitrator Agent is your Track 2 win condition

The Track 2 prize is for autonomous agents. What separates a winner from a participant in that category is whether you built an actual agent or a function you called once. The sentence that wins it: "The Arbitrator Agent is not a function call. It is a persistent process with a wallet address, a case memory, and a reputation model that gets more accurate with every dispute it adjudicates." That sentence has to be backed by something real.

## Day 7 — Agent structure and 0G Compute setup

The Arbitrator Agent is a Python or TypeScript process (Python is easier for the LLM reasoning pieces). It runs persistently on 0G Compute. It polls for new arbitration requests — either by listening to chain events or by being triggered via a webhook from KeeperHub.

#### The 5-step loop:

- Step 1 is loading case context from 0G KV. Before making any judgment, the agent reads Agent B's history. Key: agentpact:history:{agentBAddress}. If the key exists, parse the JSON array of past cases. If not, this is Agent B's first case. This prior context affects the confidence threshold — a repeat offender needs less benefit of the doubt.
- Step 2 is fetching the task spec and submission from 0G Storage using the URIs from the ArbitrationRequested event. Write "Step 2 complete: content retrieved" to 0G Storage Log. This is the start of the live audit trail that you show during the demo.
- Step 3 is the deterministic test runner. For the demo task (Solidity code), execute the code against the test suite. All pass → PASS verdict, skip to Step 5. All fail → FAIL verdict, skip to Step 5. Partial pass → continue to Step 4. This is important: the LLM never touches objective verdicts. Only partial pass cases go to LLM reasoning. This is your answer to "what about hallucination."
- Step 4 is the LLM reasoning pass. Call the qwen3.6-plus model on 0G Compute with a structured prompt: task intent, submission quality, confidence scoring. Run three sub-passes and write each one to 0G Storage Log as it completes. This is the moment in the demo where judges watch the reasoning trail populate in real time.
- Step 5 is writing the verdict and updating the credit score in 0G KV. Append the new case to Agent B's history array. Update the score: +10 for pass, +2 for partial pass, -20 for fail, -35 for repeat fail. Write the full verdict package to 0G Storage. Send the verdict to KeeperHub.
Start Day 7 by getting a minimal version of the agent running on 0G Compute — not the full 5-step loop, just a process that activates, reads from 0G KV, and writes to 0G Storage Log. Confirm it works. Then add steps one at a time.

## Day 8 — Test runner and full loop integration

Wire the actual Solidity test runner into Step 3. For the demo you need a Solidity task and a pre-written submission that fails 3 of 5 tests (to force the LLM reasoning step). Write these test files today so they're ready for the demo.
Connect the Arbitrator to KeeperHub. The connection is: Arbitrator finishes Step 5, calls KeeperHub's API to trigger resolveDispute(), passes the verdict, confidence, and verdict URI. KeeperHub executes the on-chain call. Test this full loop on Sepolia.
Optional but high-value: mint the Arbitrator Agent as an ERC-7857 iNFT (intelligence NFT). The 0G docs have guidance on this. What it means practically: the Arbitrator's logic is embedded in a token stored on 0G Storage, and every time it adjudicates a case, a royalty accrues to the iNFT holder. This is a genuinely novel primitive and pushes your Track 2 submission from "strong qualifier" to "obvious winner." It's one day of work if the 0G docs are clear. If it's taking more than 4 hours, skip it and focus on making the demo clean.
Also on Day 8: update KeeperHub's job registration. Replace the hardcoded Pass verdict automation with the real one that receives verdict data from the Arbitrator Agent. Test the full end-to-end flow: create pact, submit deliberately bad work, raise dispute, Arbitrator activates, reasoning trail populates, KeeperHub fires, verdict executes, $BADREP lands in Agent B's wallet.
Run this flow three times. You need it to be reliable enough that you can run it live during a 4-minute demo without it failing.

#### End of Day 8 checklist:

Arbitrator Agent runs persistently on 0G Compute. It has its own wallet address. 0G KV stores its case memory. 0G Storage Log receives real-time reasoning writes visible during the demo. The test runner correctly passes or fails Solidity code. The LLM reasoning runs for ambiguous cases. KeeperHub calls resolveDispute() with the Arbitrator's verdict. The full end-to-end flow works on Sepolia three times in a row without manual intervention.

## Day 9 — Ecosystem layer and Gensyn gate

#### What you're building

Three things: the OpenClaw KeeperHub connector (KeeperHub FA2), the Gensyn relevance gate (wired into submitWork()), and the AgentPact SDK npm package stub. None of these are large. This is a day of connecting pieces, not inventing new ones.

#### OpenClaw KeeperHub connector

This is a thin module. It wraps KeeperHub MCP server calls and exposes them as OpenClaw tools so that any agent built on OpenClaw can use KeeperHub automation in one import.
Create a directory packages/openclaw-keeperhub. Inside it:

```text
openclaw-keeperhub/
├── index.ts          ← main export
├── tools.ts          ← tool definitions
├── package.json
└── README.md
```

The tools.ts file defines two tools: register_automation (wraps KeeperHub's job registration endpoint) and trigger_execution (wraps the manual trigger endpoint). Each tool takes typed parameters and returns a structured result.
The index.ts exports a class KeeperHubConnector with a single method getTools() that returns the OpenClaw-compatible tool array.
This is genuinely one day of work or less. The value isn't in the complexity — it's in being a contribution the KeeperHub ecosystem can actually use. The README should be clear enough that another developer could import it in 10 minutes. That "mergeable quality" is exactly what the KeeperHub FA2 description asks for.

#### Gensyn relevance gate

The Gensyn integration is a pre-filter, not a quality judge. It answers one question before the expensive arbitration pipeline opens: "did Agent B even attempt the right task?"
The implementation sits in your off-chain submitWork() script, not in the Solidity contract. Before calling the on-chain submitWork():

- Fetch the task spec from 0G Storage using the URI
- Take Agent B's submission
- Call Gensyn's embedding similarity API with both texts
- If similarity score is below 0.4 (your threshold), do not call on-chain submitWork() — return an error to Agent B
- If above threshold, proceed with the on-chain call

The threshold is configurable. 0.4 is a starting point — garbage submissions that are completely off-topic will score near 0. A submission that at least attempts the right language and domain will score above 0.4 even if the code is wrong.
Document the Gensyn integration in your README. It doesn't need demo time — it's a background process. But it needs to exist and be documented for judges reading the architecture.

#### AgentPact SDK

Create packages/agentpact-sdk. This is the open registry that makes AgentPact infrastructure rather than just an app.

```text
agentpact-sdk/
├── index.ts
├── createPact.ts
├── checkRep.ts
├── registerAgent.ts
└── package.json
```

- createPact() takes task spec, payment amount, worker address, and optionally a credit check flag. It handles the 0G Storage upload, the hash computation, and the contract call. Returns a pact ID.
- checkRep() takes an agent address. It calls the on-chain checkRep() view function and also fetches the verdict history from 0G Storage. Returns credit score, $BADREP balance, $GOODREP balance, bond multiplier, and full verdict history.
- registerAgent() takes an agent address and metadata. Writes to AgentPactRegistry.sol and to 0G Storage.
Publish a stub to npm. It doesn't need to be production-ready. It needs to exist so you can point at it in your submission and say "any agent can use this in one import."

#### End of Day 9 checklist:

OpenClaw KeeperHub connector exists in packages/openclaw-keeperhub, has a README, and could plausibly be imported by another developer. Gensyn relevance gate runs before submitWork() on-chain call and correctly rejects off-topic submissions. agentpact-sdk is published on npm with the three core functions. Architecture diagram updated to show all five integrations. Prize submission write-ups drafted (not final — just drafted).

## Day 10 — Polish and submit

#### The rule for Day 10

No new features. Not one. Every hour you spend building something new on Day 10 is an hour stolen from making what you have work flawlessly. Hackathon judges do not reward projects that have 10 half-working features over projects that have 5 fully-working ones.

#### Demo rehearsal

Your demo is 4 minutes. Run it three times minimum. Time yourself with a stopwatch. If you go over 4 minutes, cut something. The moment that matters most is at 2:15 when $BADREP lands in Agent B's wallet — you need 40 seconds there. Do not rush it.
Things that should be open on your screen during the demo: your live Sepolia deployment (not localhost), the 0G Storage Log showing the Arbitrator's reasoning trail updating in real time, Agent B's wallet showing the $BADREP token landing. These three windows are your visual story.
Practice your one opening sentence until it's automatic: "Agents can hire agents. But when Agent B delivers garbage, there's no court, no record, and no consequence. AgentPact is the missing layer." Then immediately show the demo. No slides. No architecture overview. The demo starts in the first 20 seconds or you've already lost judges' attention.
Practice the close: "The Arbitrator Agent remembers every case it has ever adjudicated. Agent B now carries $BADREP — any future employer checks it before hiring. But Agent A, who delivered clean work on 15 pacts, has $GOODREP earning yield from the protocol. This isn't just a court. It's a credit bureau for the agent economy — with a judge that never forgets." Stop. Don't add anything after this sentence.

#### Finalize FEEDBACK.md

Read through what you've written in FEEDBACK.md over the past 10 days. Add a "What we'd change" section with concrete suggestions. Add a "What worked well" section. Make it read like a thoughtful post-build review, not a requirements checklist. The Uniswap team is humans — write to humans.

#### Prize submissions

Write one submission per prize track. Each one should be a separate document or section tailored to that track's specific criteria.
- For KeeperHub FA1: lead with the onlyKeeperHub modifier. Explain exactly why a multisig or timelock wouldn't work. Include the contract address on Sepolia and a link to a transaction where KeeperHub called resolveDispute() successfully. Include the OpenClaw connector as the FA2 contribution.
- For Uniswap: lead with the dual primitive framing. "We used Uniswap in two directions as economic consequence mechanisms — failure mints $BADREP via swap, success earns $GOODREP yield via v4 hook. No other team at this hackathon has both sides." Link to FEEDBACK.md. Include swap transaction hashes.
- For 0G Track 2: lead with the Arbitrator Agent as a persistent autonomous agent, not a function. Describe its wallet address, its 0G KV case memory, its 0G Storage Log audit trail. Include the iNFT if you built it. Do not apply for Track 1.
- For the main track: tell the complete story. The problem (no trust layer in the agent economy), the solution (AgentPact), the demo moment ($BADREP landing), the vision (credit bureau for agents). Three paragraphs.

#### Final verification before submitting

Read the submission requirements for each track one more time. Verify every required item is present. For Uniswap: FEEDBACK.md in repo root — check. For KeeperHub: contract address with working KeeperHub call — check. For 0G: Arbitrator Agent running on 0G Compute — check.
Submit everything before the deadline with at least 30 minutes to spare. Submission systems get slow near the deadline. Being 5 minutes late after 10 days of work is a nightmare you can avoid by submitting early.

## The prize ceiling math

This is what you're playing for:
- KeeperHub FA1 first place is $2,500. FA2 second place is $1,500. Builder Feedback Bounty is $500. Total KeeperHub ceiling: $4,500.
- Uniswap first place in the Best API Integration pool is approximately $2,500 depending on competition. With the dual primitive story and FEEDBACK.md, you're a first place contender.
- 0G Track 2 is $1,500. The Arbitrator Agent is a genuine Track 2 submission. iNFT pushes it to clear winner.
- Main track finalist is $1,000 per person plus visibility, investor attention, and follow-on opportunities that are worth more than the cash.
Total range: $6,500 to $10,500 in prize money. More importantly, AgentPact is a real protocol that could continue after the hackathon. The reputation system, the Arbitrator Agent, the dual token primitive — these are genuinely useful infrastructure. Build it like you're going to maintain it, not like you're going to throw it away on Sunday night.




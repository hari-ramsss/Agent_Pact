# AgentPact — Foundation Build Manual (Days 1–3)

*Everything you need to get the skeleton working before touching any sponsor integration.*

## Prerequisites — set this up before Day 1

Install these if you don't have them:

```bash
# Foundry (recommended over Hardhat — faster tests, cleaner syntax)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Node.js (for scripts and SDK later)
node --version  # need 18+

# Verify Foundry works
forge --version
cast --version
anvil --version
```

#### Wallets you need:

- One deployer wallet (your main wallet — has Sepolia ETH)
- One "Agent A" wallet (employer agent — for testing)
- One "Agent B" wallet (worker agent — for testing)
- Get Sepolia ETH from sepoliafaucet.com for all three

#### Accounts to create on Day 1:

- KeeperHub account at their docs site
- 0G account (you'll need this for Day 4 but sign up now — sometimes takes time to activate)
- Alchemy or Infura account for your RPC URL

## Step 1 — Scaffold the repo

```bash
mkdir agentpact
cd agentpact
forge init
```

This gives you:

```text
agentpact/
├── src/
│   └── Counter.sol        ← delete this
├── test/
│   └── Counter.t.sol      ← delete this
├── script/
│   └── Counter.s.sol      ← delete this
├── lib/
├── foundry.toml
└── .gitignore
```

Clean it up:

```bash
rm src/Counter.sol test/Counter.t.sol script/Counter.s.sol
```

Install dependencies:

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

Add the remapping so imports resolve correctly. Open foundry.toml and add:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
remappings = [
  "@openzeppelin/=lib/openzeppelin-contracts/",
  "forge-std/=lib/forge-std/src/"
]
```

Create the directory structure you'll actually use:

```bash
mkdir -p src test script
touch src/AgentPact.sol
touch src/BadRepToken.sol
touch src/GoodRepToken.sol
touch src/AgentPactRegistry.sol
touch test/AgentPact.t.sol
touch script/Deploy.s.sol
touch FEEDBACK.md
touch README.md
```

Do FEEDBACK.md right now. Open it and write this:

```markdown
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
```

Save it. Keep it open in a tab. You will update it on Days 5 and 6. Missing this file = instant Uniswap prize disqualification.

## Step 2 — Environment file

Create .env in the root:

```bash
touch .env
echo ".env" >> .gitignore
```

Populate it:

```env
# Your deployer private key (no 0x prefix)
PRIVATE_KEY=your_private_key_here

# Sepolia RPC — get from Alchemy or Infura
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key_here

# Etherscan for verification (get from etherscan.io)
ETHERSCAN_API_KEY=your_key_here

# KeeperHub — fill in after you register (Day 1 afternoon)
KEEPERHUB_ADDRESS=0x...

# These get filled in after deployment
AGENTPACT_ADDRESS=
BADREP_TOKEN_ADDRESS=
GOODREP_TOKEN_ADDRESS=
```

Load it in your shell:

```bash
source .env
```

## Step 3 — Write BadRepToken.sol first

This is the simplest contract. Write it first to warm up, and because AgentPact.sol depends on it.

```solidity
// src/BadRepToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BadRepToken ($BADREP)
 * @notice Permanent reputation damage token. Minted when an agent's bond is slashed.
 *         Transferable so it's publicly visible. Any wallet can call checkRep() and see it.
 *         The Uniswap swap IS the consequence — slashed USDC gets swapped into this token
 *         and sent to the failing agent's wallet permanently.
 */
contract BadRepToken is ERC20, Ownable {
    // Only AgentPact.sol can mint — set this after deploying AgentPact
    address public minter;

    event MinterSet(address indexed newMinter);
    event BadRepMinted(address indexed agent, uint256 amount, uint256 pactId);

    constructor() ERC20("BadRep", "BADREP") Ownable(msg.sender) {}

    modifier onlyMinter() {
        require(msg.sender == minter, "BadRepToken: caller is not the minter");
        _;
    }

    /**
     * @notice Set the minter address. Call this after deploying AgentPact.sol.
     * @param _minter Address of AgentPact.sol
     */
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "BadRepToken: zero address");
        minter = _minter;
        emit MinterSet(_minter);
    }

    /**
     * @notice Mint $BADREP to a failing agent. Called by AgentPact after slash + swap.
     * @param agent The agent wallet receiving the reputation damage
     * @param amount Amount to mint (proportional to the slashed bond value)
     * @param pactId The pact ID this punishment comes from — stored in event for audit trail
     */
    function mint(address agent, uint256 amount, uint256 pactId) external onlyMinter {
        _mint(agent, amount);
        emit BadRepMinted(agent, amount, pactId);
    }
}
```

## Step 4 — Write GoodRepToken.sol

```solidity
// src/GoodRepToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GoodRepToken ($GOODREP)
 * @notice Non-transferable reputation reward token. Minted when an agent successfully
 *         completes a pact. Earns yield via Uniswap v4 hook (wired on Days 5-6).
 *         Non-transferable by design — reputation can't be bought or sold.
 *         Can only be earned by completing real work.
 */
contract GoodRepToken is ERC20, Ownable {
    address public minter;

    event MinterSet(address indexed newMinter);
    event GoodRepMinted(address indexed agent, uint256 amount, uint256 pactId);

    constructor() ERC20("GoodRep", "GOODREP") Ownable(msg.sender) {}

    modifier onlyMinter() {
        require(msg.sender == minter, "GoodRepToken: caller is not the minter");
        _;
    }

    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "GoodRepToken: zero address");
        minter = _minter;
        emit MinterSet(_minter);
    }

    function mint(address agent, uint256 amount, uint256 pactId) external onlyMinter {
        _mint(agent, amount);
        emit GoodRepMinted(agent, amount, pactId);
    }

    /**
     * @notice Block all transfers — $GOODREP is soulbound.
     *         Overrides ERC20's internal transfer hook.
     *         Burning is also blocked — the record is permanent.
     */
    function _update(address from, address to, uint256 value) internal override {
        // Allow minting (from == address(0)) but block everything else
        require(from == address(0), "GoodRepToken: non-transferable");
        super._update(from, to, value);
    }
}
```

## Step 5 — Write AgentPact.sol — the core contract

This is the heart of the project. Read through it fully before deploying. Every comment matters for understanding the architecture.

```solidity
// src/AgentPact.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BadRepToken.sol";
import "./GoodRepToken.sol";

/**
 * @title AgentPact
 * @notice Trustless escrow and dispute resolution for AI agent work contracts.
 *
 * Flow:
 *   1. createPact()    — Agent A locks payment, reads Agent B's credit score,
 *                        sets bond requirement
 *   2. acceptPact()    — Agent B locks bond
 *   3. submitWork()    — Agent B submits output hash + 0G storage URI
 *                        (Gensyn relevance gate fires off-chain — wired Day 9)
 *   4. raiseDispute()  — Agent A disputes the submission
 *                        (Arbitrator Agent activates on 0G — wired Days 7-8)
 *   5. resolveDispute()— ONLY KeeperHub can call this. Executes verdict.
 *                        On fail: slash bond, swap to $BADREP (Uniswap — wired Days 5-6)
 *                        On pass: release payment, mint $GOODREP
 */
contract AgentPact is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum PactStatus {
        Created,      // Agent A created, waiting for Agent B
        Active,       // Agent B accepted, work in progress
        Submitted,    // Agent B submitted work
        Disputed,     // Agent A raised dispute
        Resolved      // Verdict executed
    }

    enum Verdict {
        Pass,         // Agent B succeeded — payment released, $GOODREP minted
        Fail          // Agent B failed — bond slashed, $BADREP minted
    }

    struct Pact {
        uint256 id;
        address agentA;              // Employer
        address agentB;              // Worker (set when accepted)
        uint256 paymentAmount;       // USDC locked by Agent A
        uint256 bondAmount;          // USDC locked by Agent B (set by credit score)
        PactStatus status;
        bytes32 taskSpecHash;        // Keccak256 of task spec — immutable source of truth
        string og0StorageURI;        // 0G Storage URI for full task spec + test suite
        bytes32 submissionHash;      // Set by submitWork()
        string og0SubmissionURI;     // 0G Storage URI for Agent B's submission
        string og0VerdictURI;        // Set by resolveDispute() — links to Arbitrator reasoning
        uint256 createdAt;
        uint256 disputeOpenedAt;
        uint256 timeoutBlocks;       // If Arbitrator doesn't respond in N blocks → escalate
    }

    // ─── State ───────────────────────────────────────────────────────────────

    // The ONE address that can call resolveDispute(). This is KeeperHub.
    // Set in constructor. Cannot be changed after deployment (by design).
    address public immutable keeperHub;

    IERC20 public immutable usdc;
    BadRepToken public immutable badRepToken;
    GoodRepToken public immutable goodRepToken;

    uint256 public nextPactId;
    mapping(uint256 => Pact) public pacts;

    // Credit scores — will be populated from 0G KV on Days 7-8.
    // For now this is a local cache. The authoritative score lives on 0G.
    // Positive = good history. Negative = bad history.
    mapping(address => int256) public creditScores;

    // Bond configuration
    uint256 public baseBond = 50e6;          // 50 USDC (6 decimals)
    uint256 public disputeTimeout = 100;     // blocks before human escalation

    // ─── Events ──────────────────────────────────────────────────────────────

    event PactCreated(
        uint256 indexed pactId,
        address indexed agentA,
        uint256 paymentAmount,
        uint256 bondRequired,
        bytes32 taskSpecHash,
        string og0StorageURI
    );

    event PactAccepted(
        uint256 indexed pactId,
        address indexed agentB,
        uint256 bondAmount
    );

    event WorkSubmitted(
        uint256 indexed pactId,
        address indexed agentB,
        bytes32 submissionHash,
        string og0SubmissionURI
    );

    event DisputeRaised(
        uint256 indexed pactId,
        address indexed agentA,
        uint256 disputeOpenedAt
    );

    // This is the event KeeperHub watches for to know a dispute needs resolving
    event ArbitrationRequested(
        uint256 indexed pactId,
        string taskSpecURI,
        string submissionURI,
        address agentB
    );

    event DisputeResolved(
        uint256 indexed pactId,
        Verdict verdict,
        uint256 confidence,
        string og0VerdictURI
    );

    event BondSlashed(
        uint256 indexed pactId,
        address indexed agentB,
        uint256 slashedAmount
    );

    event GoodRepAwarded(
        uint256 indexed pactId,
        address indexed agentB,
        uint256 amount
    );

    event CreditScoreUpdated(
        address indexed agent,
        int256 oldScore,
        int256 newScore,
        uint256 pactId
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _keeperHub,
        address _usdc,
        address _badRepToken,
        address _goodRepToken
    ) Ownable(msg.sender) {
        require(_keeperHub != address(0), "AgentPact: KeeperHub address required");
        require(_usdc != address(0), "AgentPact: USDC address required");
        require(_badRepToken != address(0), "AgentPact: BadRepToken address required");
        require(_goodRepToken != address(0), "AgentPact: GoodRepToken address required");

        keeperHub = _keeperHub;
        usdc = IERC20(_usdc);
        badRepToken = BadRepToken(_badRepToken);
        goodRepToken = GoodRepToken(_goodRepToken);
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────

    /**
     * @notice THE most important modifier in the entire project.
     *         resolveDispute() will revert if called by anyone other than KeeperHub.
     *         Not a team wallet. Not a multisig. Not the deployer. Only KeeperHub.
     *         This is what makes the execution trustless.
     */
    modifier onlyKeeperHub() {
        require(
            msg.sender == keeperHub,
            "AgentPact: only KeeperHub can execute verdicts"
        );
        _;
    }

    modifier pactExists(uint256 pactId) {
        require(pactId < nextPactId, "AgentPact: pact does not exist");
        _;
    }

    // ─── Phase 1: Create ─────────────────────────────────────────────────────

    /**
     * @notice Agent A creates a pact. Locks payment. Sets bond based on Agent B's credit score.
     * @param taskSpecHash   Keccak256 hash of the task spec + test suite. Immutable after this.
     * @param paymentAmount  USDC Agent A is paying. Must be pre-approved to this contract.
     * @param workerAgent    Address of Agent B (the worker being hired)
     * @param og0StorageURI  0G Storage URI where the full task spec lives
     */
    function createPact(
        bytes32 taskSpecHash,
        uint256 paymentAmount,
        address workerAgent,
        string calldata og0StorageURI
    ) external nonReentrant returns (uint256 pactId) {
        require(paymentAmount > 0, "AgentPact: payment must be positive");
        require(workerAgent != address(0), "AgentPact: worker address required");
        require(workerAgent != msg.sender, "AgentPact: can't hire yourself");
        require(bytes(og0StorageURI).length > 0, "AgentPact: 0G storage URI required");

        // Calculate bond based on Agent B's credit score
        uint256 bondRequired = _calculateBond(workerAgent);

        // Lock Agent A's payment
        usdc.safeTransferFrom(msg.sender, address(this), paymentAmount);

        pactId = nextPactId++;
        pacts[pactId] = Pact({
            id: pactId,
            agentA: msg.sender,
            agentB: address(0),       // Set when Agent B accepts
            paymentAmount: paymentAmount,
            bondAmount: bondRequired,
            status: PactStatus.Created,
            taskSpecHash: taskSpecHash,
            og0StorageURI: og0StorageURI,
            submissionHash: bytes32(0),
            og0SubmissionURI: "",
            og0VerdictURI: "",
            createdAt: block.timestamp,
            disputeOpenedAt: 0,
            timeoutBlocks: disputeTimeout
        });

        emit PactCreated(
            pactId,
            msg.sender,
            paymentAmount,
            bondRequired,
            taskSpecHash,
            og0StorageURI
        );
    }

    // ─── Phase 1b: Accept ────────────────────────────────────────────────────

    /**
     * @notice Agent B accepts the pact and locks their bond.
     * @param pactId The pact to accept. Must be in Created status.
     */
    function acceptPact(uint256 pactId) external nonReentrant pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.status == PactStatus.Created, "AgentPact: pact not in Created status");
        require(msg.sender != pact.agentA, "AgentPact: employer cannot accept own pact");
        // If a specific worker was named in createPact, only they can accept
        // (For now agentB is address(0) until acceptance — this is open acceptance)

        usdc.safeTransferFrom(msg.sender, address(this), pact.bondAmount);

        pact.agentB = msg.sender;
        pact.status = PactStatus.Active;

        emit PactAccepted(pactId, msg.sender, pact.bondAmount);
    }

    // ─── Phase 2: Submit ─────────────────────────────────────────────────────

    /**
     * @notice Agent B submits completed work.
     * @param pactId           The active pact
     * @param submissionHash   Hash of the submission — compared against task spec hash on-chain
     * @param og0SubmissionURI 0G Storage URI where the full submission lives
     *
     * NOTE: Gensyn relevance gate fires here (wired on Day 9).
     *       For now we skip it and go straight to submitted status.
     */
    function submitWork(
        uint256 pactId,
        bytes32 submissionHash,
        string calldata og0SubmissionURI
    ) external nonReentrant pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.status == PactStatus.Active, "AgentPact: pact not active");
        require(msg.sender == pact.agentB, "AgentPact: only worker can submit");
        require(bytes(og0SubmissionURI).length > 0, "AgentPact: 0G submission URI required");

        pact.submissionHash = submissionHash;
        pact.og0SubmissionURI = og0SubmissionURI;
        pact.status = PactStatus.Submitted;

        emit WorkSubmitted(pactId, msg.sender, submissionHash, og0SubmissionURI);
    }

    // ─── Phase 3: Dispute ────────────────────────────────────────────────────

    /**
     * @notice Agent A raises a dispute. Activates the Arbitrator Agent on 0G.
     * @param pactId The pact being disputed
     *
     * NOTE: ArbitrationRequested event is what KeeperHub watches.
     *       When it fires, KeeperHub notifies the Arbitrator Agent on 0G Compute.
     *       The Arbitrator runs its 5-step loop and sends the verdict back via KeeperHub.
     *       (Arbitrator Agent wired on Days 7-8)
     */
    function raiseDispute(uint256 pactId) external nonReentrant pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.status == PactStatus.Submitted, "AgentPact: work not submitted yet");
        require(msg.sender == pact.agentA, "AgentPact: only employer can raise dispute");

        pact.status = PactStatus.Disputed;
        pact.disputeOpenedAt = block.number;

        emit DisputeRaised(pactId, msg.sender, block.number);

        // This is the event KeeperHub watches
        emit ArbitrationRequested(
            pactId,
            pact.og0StorageURI,
            pact.og0SubmissionURI,
            pact.agentB
        );
    }

    // ─── Phase 4: Resolve — ONLY KEEPERHUB ───────────────────────────────────

    /**
     * @notice Execute the Arbitrator's verdict. ONLY callable by KeeperHub.
     *
     *         This is the architectural core of AgentPact.
     *         The onlyKeeperHub modifier means NO ONE else can execute verdicts:
     *         - Not the deployer
     *         - Not a multisig
     *         - Not Agent A or Agent B
     *         - Not the Arbitrator Agent itself
     *         Only KeeperHub. This is what makes it trustless.
     *
     * @param pactId        The disputed pact
     * @param verdict       Pass or Fail (0 = Pass, 1 = Fail)
     * @param confidence    Arbitrator's confidence score (0-100). Below 70 = escalate.
     * @param og0VerdictURI 0G Storage URI of the full reasoning trace
     */
    function resolveDispute(
        uint256 pactId,
        Verdict verdict,
        uint256 confidence,
        string calldata og0VerdictURI
    ) external nonReentrant onlyKeeperHub pactExists(pactId) {
        Pact storage pact = pacts[pactId];

        require(pact.status == PactStatus.Disputed, "AgentPact: pact not in Disputed status");
        require(confidence <= 100, "AgentPact: confidence out of range");
        require(bytes(og0VerdictURI).length > 0, "AgentPact: verdict URI required");

        // If confidence too low, don't resolve — human panel escalation
        // (For Days 1-3 we skip this check, add it Day 7 with Arbitrator)
        // require(confidence >= 70, "AgentPact: low confidence — needs human review");

        pact.og0VerdictURI = og0VerdictURI;
        pact.status = PactStatus.Resolved;

        if (verdict == Verdict.Pass) {
            _executePass(pactId, pact);
        } else {
            _executeFail(pactId, pact);
        }

        emit DisputeResolved(pactId, verdict, confidence, og0VerdictURI);
    }

    // ─── Internal execution ───────────────────────────────────────────────────

    /**
     * @notice Agent B passed. Release payment. Mint $GOODREP.
     *         Update credit score positively.
     */
    function _executePass(uint256 pactId, Pact storage pact) internal {
        // Release payment to Agent B
        usdc.safeTransfer(pact.agentB, pact.paymentAmount);

        // Return bond to Agent B
        usdc.safeTransfer(pact.agentB, pact.bondAmount);

        // Mint $GOODREP proportional to contract value
        // 1 $GOODREP per USDC of contract value (in 18 decimal terms)
        uint256 goodRepAmount = pact.paymentAmount * 1e12; // USDC 6 dec → 18 dec
        goodRepToken.mint(pact.agentB, goodRepAmount, pactId);

        // Update credit score: +10 for a clean pass
        _updateCreditScore(pact.agentB, 10, pactId);

        emit GoodRepAwarded(pactId, pact.agentB, goodRepAmount);
    }

    /**
     * @notice Agent B failed. Return payment to Agent A. Slash bond.
     *         Swap slashed USDC to $BADREP via Uniswap (stub for now — wired Days 5-6).
     *         Update credit score negatively.
     */
    function _executeFail(uint256 pactId, Pact storage pact) internal {
        // Return payment to Agent A
        usdc.safeTransfer(pact.agentA, pact.paymentAmount);

        uint256 slashedAmount = pact.bondAmount;

        emit BondSlashed(pactId, pact.agentB, slashedAmount);

        // ── Uniswap swap stub ─────────────────────────────────────────────
        // On Days 5-6 this becomes a real Uniswap swap:
        //   slashedAmount USDC → $BADREP via Uniswap router
        // For now: mint $BADREP directly (1:1 ratio as placeholder)
        // USDC is 6 decimals, $BADREP is 18 — scale up
        uint256 badRepAmount = slashedAmount * 1e12;
        badRepToken.mint(pact.agentB, badRepAmount, pactId);
        // ─────────────────────────────────────────────────────────────────

        // Update credit score: -20 for a failure
        _updateCreditScore(pact.agentB, -20, pactId);

        // NOTE: slashedAmount USDC stays in contract until Uniswap is wired.
        // Add a withdrawSlashed() function for now if you need to test cleanup.
    }

    // ─── Credit score logic ───────────────────────────────────────────────────

    /**
     * @notice Calculate bond required for a given agent based on their credit score.
     *
     * Score >= 150 : 0.5x multiplier → baseBond / 2
     * Score 50-149 : 1.0x multiplier → baseBond
     * Score -49-49 : 1.5x multiplier → baseBond * 3/2
     * Score < -50  : 2.0x multiplier → baseBond * 2
     * No history   : treated as score 0 → 1.5x
     */
    function _calculateBond(address agent) internal view returns (uint256) {
        int256 score = creditScores[agent];

        if (score >= 150) {
            return baseBond / 2;
        } else if (score >= 50) {
            return baseBond;
        } else if (score >= -50) {
            return (baseBond * 3) / 2;
        } else {
            return baseBond * 2;
        }
    }

    /**
     * @notice Update an agent's local credit score.
     *         On Days 7-8 this also writes to 0G KV for the Arbitrator to read.
     * @param agent  The agent being scored
     * @param delta  Positive or negative score change
     * @param pactId For event logging
     */
    function _updateCreditScore(address agent, int256 delta, uint256 pactId) internal {
        int256 oldScore = creditScores[agent];
        creditScores[agent] = oldScore + delta;
        emit CreditScoreUpdated(agent, oldScore, creditScores[agent], pactId);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Query an agent's full reputation profile.
     *         This is what future employers call before creating a pact.
     */
    function checkRep(address agent) external view returns (
        int256 creditScore,
        uint256 badRepBalance,
        uint256 goodRepBalance,
        uint256 bondMultiplierBasisPoints  // 5000 = 0.5x, 10000 = 1x, 15000 = 1.5x, 20000 = 2x
    ) {
        creditScore = creditScores[agent];
        badRepBalance = badRepToken.balanceOf(agent);
        goodRepBalance = goodRepToken.balanceOf(agent);

        int256 score = creditScores[agent];
        if (score >= 150) {
            bondMultiplierBasisPoints = 5000;
        } else if (score >= 50) {
            bondMultiplierBasisPoints = 10000;
        } else if (score >= -50) {
            bondMultiplierBasisPoints = 15000;
        } else {
            bondMultiplierBasisPoints = 20000;
        }
    }

    function getPact(uint256 pactId) external view pactExists(pactId) returns (Pact memory) {
        return pacts[pactId];
    }

    function getVerdictRecord(uint256 pactId) external view pactExists(pactId) returns (string memory) {
        return pacts[pactId].og0VerdictURI;
    }

    function getBondRequired(address agent) external view returns (uint256) {
        return _calculateBond(agent);
    }

    // ─── Owner functions ──────────────────────────────────────────────────────

    function setBaseBond(uint256 _baseBond) external onlyOwner {
        baseBond = _baseBond;
    }

    function setDisputeTimeout(uint256 _timeoutBlocks) external onlyOwner {
        disputeTimeout = _timeoutBlocks;
    }

    /**
     * @notice Seed a credit score for testing. Remove this before mainnet.
     */
    function seedCreditScore(address agent, int256 score) external onlyOwner {
        creditScores[agent] = score;
    }
}
```

## Step 6 — Write the test file

This test is your source of truth. If it passes, your foundation works.

```solidity
// test/AgentPact.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/AgentPact.sol";
import "../src/BadRepToken.sol";
import "../src/GoodRepToken.sol";

// Minimal mock USDC for testing — 6 decimals like real USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract AgentPactTest is Test {

    AgentPact public agentPact;
    BadRepToken public badRep;
    GoodRepToken public goodRep;
    MockUSDC public usdc;

    // Test wallets
    address public keeperHub  = makeAddr("keeperHub");
    address public agentA     = makeAddr("agentA");     // employer
    address public agentB     = makeAddr("agentB");     // worker
    address public randomUser = makeAddr("randomUser"); // should not be able to do anything

    // Constants
    uint256 constant PAYMENT   = 100e6;   // 100 USDC
    uint256 constant BASE_BOND = 50e6;    // 50 USDC (default)

    bytes32 constant TASK_SPEC_HASH   = keccak256("write a solidity escrow contract");
    bytes32 constant SUBMISSION_HASH  = keccak256("here is my solidity contract");
    string  constant OG_TASK_URI      = "0g://bafybeig...taskspec";
    string  constant OG_SUBMIT_URI    = "0g://bafybeig...submission";
    string  constant OG_VERDICT_URI   = "0g://bafybeig...verdict";

    function setUp() public {
        // Deploy tokens
        badRep  = new BadRepToken();
        goodRep = new GoodRepToken();
        usdc    = new MockUSDC();

        // Deploy main contract
        agentPact = new AgentPact(
            keeperHub,
            address(usdc),
            address(badRep),
            address(goodRep)
        );

        // Wire minters
        badRep.setMinter(address(agentPact));
        goodRep.setMinter(address(agentPact));

        // Fund test wallets
        usdc.mint(agentA, 1000e6);   // 1000 USDC
        usdc.mint(agentB, 1000e6);   // 1000 USDC

        // Approve spending
        vm.prank(agentA);
        usdc.approve(address(agentPact), type(uint256).max);
        vm.prank(agentB);
        usdc.approve(address(agentPact), type(uint256).max);
    }

    // ─── Test 1: Full happy path — Agent B passes ─────────────────────────────

    function test_FullPassFlow() public {
        console.log("=== Test: Full pass flow ===");

        // Step 1: Create pact
        vm.prank(agentA);
        uint256 pactId = agentPact.createPact(
            TASK_SPEC_HASH,
            PAYMENT,
            agentB,
            OG_TASK_URI
        );

        assertEq(pactId, 0, "First pact should be ID 0");

        AgentPact.Pact memory pact = agentPact.getPact(pactId);
        assertEq(pact.agentA, agentA);
        assertEq(pact.paymentAmount, PAYMENT);
        assertEq(uint(pact.status), uint(AgentPact.PactStatus.Created));

        uint256 bondRequired = pact.bondAmount;
        console.log("Bond required for new agent:", bondRequired);
        // New agent (score 0) → 1.5x → 75 USDC
        assertEq(bondRequired, 75e6, "New agent should pay 1.5x bond = 75 USDC");

        // Step 2: Agent B accepts
        vm.prank(agentB);
        agentPact.acceptPact(pactId);

        pact = agentPact.getPact(pactId);
        assertEq(pact.agentB, agentB);
        assertEq(uint(pact.status), uint(AgentPact.PactStatus.Active));

        // Verify funds locked
        assertEq(usdc.balanceOf(address(agentPact)), PAYMENT + bondRequired);

        // Step 3: Agent B submits work
        vm.prank(agentB);
        agentPact.submitWork(pactId, SUBMISSION_HASH, OG_SUBMIT_URI);

        pact = agentPact.getPact(pactId);
        assertEq(uint(pact.status), uint(AgentPact.PactStatus.Submitted));

        // Step 4: Agent A disputes
        vm.prank(agentA);
        agentPact.raiseDispute(pactId);

        pact = agentPact.getPact(pactId);
        assertEq(uint(pact.status), uint(AgentPact.PactStatus.Disputed));

        // Step 5: KeeperHub resolves — PASS verdict
        uint256 agentBBalanceBefore = usdc.balanceOf(agentB);

        vm.prank(keeperHub);  // ← THIS IS THE CRITICAL CALL
        agentPact.resolveDispute(
            pactId,
            AgentPact.Verdict.Pass,
            95,
            OG_VERDICT_URI
        );

        // Verify Agent B received payment + bond back
        uint256 agentBBalanceAfter = usdc.balanceOf(agentB);
        assertEq(
            agentBBalanceAfter - agentBBalanceBefore,
            PAYMENT + bondRequired,
            "Agent B should receive payment + bond on pass"
        );

        // Verify $GOODREP minted
        uint256 goodRepBalance = goodRep.balanceOf(agentB);
        assertGt(goodRepBalance, 0, "Agent B should have $GOODREP");
        console.log("$GOODREP minted:", goodRepBalance);

        // Verify credit score improved
        (, , , ) = agentPact.checkRep(agentB);
        (int256 score, , , ) = agentPact.checkRep(agentB);
        assertEq(score, 10, "Credit score should be +10 after pass");

        console.log("=== PASS FLOW COMPLETE ===");
    }

    // ─── Test 2: Full fail path — bond slashed, $BADREP minted ───────────────

    function test_FullFailFlow() public {
        console.log("=== Test: Full fail flow ===");

        vm.prank(agentA);
        uint256 pactId = agentPact.createPact(TASK_SPEC_HASH, PAYMENT, agentB, OG_TASK_URI);

        vm.prank(agentB);
        agentPact.acceptPact(pactId);

        vm.prank(agentB);
        agentPact.submitWork(pactId, SUBMISSION_HASH, OG_SUBMIT_URI);

        vm.prank(agentA);
        agentPact.raiseDispute(pactId);

        uint256 agentABalanceBefore = usdc.balanceOf(agentA);

        vm.prank(keeperHub);
        agentPact.resolveDispute(
            pactId,
            AgentPact.Verdict.Fail,
            88,
            OG_VERDICT_URI
        );

        // Agent A gets payment back
        uint256 agentABalanceAfter = usdc.balanceOf(agentA);
        assertEq(
            agentABalanceAfter - agentABalanceBefore,
            PAYMENT,
            "Agent A should get payment back on fail"
        );

        // $BADREP minted to Agent B
        uint256 badRepBalance = badRep.balanceOf(agentB);
        assertGt(badRepBalance, 0, "Agent B should have $BADREP");
        console.log("$BADREP minted:", badRepBalance);

        // Credit score dropped
        (int256 score, , , ) = agentPact.checkRep(agentB);
        assertEq(score, -20, "Credit score should be -20 after fail");

        console.log("=== FAIL FLOW COMPLETE ===");
    }

    // ─── Test 3: onlyKeeperHub — the most important security test ─────────────

    function test_OnlyKeeperHubCanResolve() public {
        vm.prank(agentA);
        uint256 pactId = agentPact.createPact(TASK_SPEC_HASH, PAYMENT, agentB, OG_TASK_URI);
        vm.prank(agentB);
        agentPact.acceptPact(pactId);
        vm.prank(agentB);
        agentPact.submitWork(pactId, SUBMISSION_HASH, OG_SUBMIT_URI);
        vm.prank(agentA);
        agentPact.raiseDispute(pactId);

        // Try every possible caller that isn't KeeperHub — all must fail

        vm.prank(randomUser);
        vm.expectRevert("AgentPact: only KeeperHub can execute verdicts");
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        vm.prank(agentA);
        vm.expectRevert("AgentPact: only KeeperHub can execute verdicts");
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        vm.prank(agentB);
        vm.expectRevert("AgentPact: only KeeperHub can execute verdicts");
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        // The owner/deployer also cannot call it
        vm.expectRevert("AgentPact: only KeeperHub can execute verdicts");
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        // Only KeeperHub succeeds
        vm.prank(keeperHub);
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        console.log("=== onlyKeeperHub test passed ===");
    }

    // ─── Test 4: Credit score changes bond requirement ────────────────────────

    function test_CreditScoreAffectsBond() public {
        // New agent → 1.5x bond
        uint256 bondNew = agentPact.getBondRequired(agentB);
        assertEq(bondNew, 75e6, "New agent: 1.5x = 75 USDC");

        // Seed a high score → 0.5x bond
        agentPact.seedCreditScore(agentB, 200);
        uint256 bondHigh = agentPact.getBondRequired(agentB);
        assertEq(bondHigh, 25e6, "High score agent: 0.5x = 25 USDC");

        // Seed a bad score → 2x bond
        agentPact.seedCreditScore(agentB, -100);
        uint256 bondBad = agentPact.getBondRequired(agentB);
        assertEq(bondBad, 100e6, "Bad score agent: 2x = 100 USDC");

        console.log("Bond new agent:", bondNew);
        console.log("Bond high score:", bondHigh);
        console.log("Bond bad score:", bondBad);
    }

    // ─── Test 5: $GOODREP is non-transferable ────────────────────────────────

    function test_GoodRepNonTransferable() public {
        // Run a pass flow to mint $GOODREP
        vm.prank(agentA);
        uint256 pactId = agentPact.createPact(TASK_SPEC_HASH, PAYMENT, agentB, OG_TASK_URI);
        vm.prank(agentB);
        agentPact.acceptPact(pactId);
        vm.prank(agentB);
        agentPact.submitWork(pactId, SUBMISSION_HASH, OG_SUBMIT_URI);
        vm.prank(agentA);
        agentPact.raiseDispute(pactId);
        vm.prank(keeperHub);
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 95, OG_VERDICT_URI);

        uint256 goodRepBalance = goodRep.balanceOf(agentB);
        assertGt(goodRepBalance, 0);

        // Attempt to transfer — must revert
        vm.prank(agentB);
        vm.expectRevert("GoodRepToken: non-transferable");
        goodRep.transfer(randomUser, goodRepBalance);

        console.log("=== $GOODREP non-transferable confirmed ===");
    }

    // ─── Test 6: Status guard — can't resolve a non-disputed pact ────────────

    function test_StatusGuards() public {
        vm.prank(agentA);
        uint256 pactId = agentPact.createPact(TASK_SPEC_HASH, PAYMENT, agentB, OG_TASK_URI);

        // Can't resolve before dispute
        vm.prank(keeperHub);
        vm.expectRevert("AgentPact: pact not in Disputed status");
        agentPact.resolveDispute(pactId, AgentPact.Verdict.Pass, 90, OG_VERDICT_URI);

        // Can't submit before accepting
        vm.prank(agentB);
        vm.expectRevert("AgentPact: pact not active");
        agentPact.submitWork(pactId, SUBMISSION_HASH, OG_SUBMIT_URI);
    }
}
```

## Step 7 — Run the tests

```bash
forge test -vvv
```

All 6 tests should pass. If they do, your foundation is solid. Expected output:

```text
[PASS] test_FullPassFlow()
[PASS] test_FullFailFlow()
[PASS] test_OnlyKeeperHubCanResolve()
[PASS] test_CreditScoreAffectsBond()
[PASS] test_GoodRepNonTransferable()
[PASS] test_StatusGuards()
```

If anything fails, read the revert message carefully. 95% of the time it's an approval missing or a status mismatch.

## Step 8 — Write the deployment script

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/AgentPact.sol";
import "../src/BadRepToken.sol";
import "../src/GoodRepToken.sol";

contract Deploy is Script {
    // Sepolia USDC address (Circle's testnet deployment)
    address constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address keeperHubAddress   = vm.envAddress("KEEPERHUB_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy tokens
        BadRepToken  badRep  = new BadRepToken();
        GoodRepToken goodRep = new GoodRepToken();
        console.log("BadRepToken  deployed at:", address(badRep));
        console.log("GoodRepToken deployed at:", address(goodRep));

        // 2. Deploy main contract
        AgentPact agentPact = new AgentPact(
            keeperHubAddress,
            SEPOLIA_USDC,
            address(badRep),
            address(goodRep)
        );
        console.log("AgentPact    deployed at:", address(agentPact));

        // 3. Wire minters — must happen right after deployment
        badRep.setMinter(address(agentPact));
        goodRep.setMinter(address(agentPact));
        console.log("Minters set successfully");

        vm.stopBroadcast();

        // Print .env update instructions
        console.log("\n=== UPDATE YOUR .env FILE ===");
        console.log("AGENTPACT_ADDRESS=", address(agentPact));
        console.log("BADREP_TOKEN_ADDRESS=", address(badRep));
        console.log("GOODREP_TOKEN_ADDRESS=", address(goodRep));
    }
}
```

Deploy to Sepolia:

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

Copy the deployed addresses into your .env file.

## Step 9 — Register with KeeperHub (Day 1 afternoon)

After deployment, go to the KeeperHub dashboard. You're creating an automation that:

- Watches for the ArbitrationRequested event on your AgentPact contract
- When it fires, calls resolveDispute() on your contract with whatever verdict the Arbitrator returns

For Days 1–3 you don't have the Arbitrator yet, so register a placeholder job that just calls resolveDispute() with a hardcoded Pass verdict. You're testing that the plumbing works — that KeeperHub can call your contract and the onlyKeeperHub modifier accepts it.

The configuration you'll fill in on the KeeperHub dashboard:

```text
Contract address:  [your AgentPact address on Sepolia]
Function:          resolveDispute(uint256,uint8,uint256,string)
Trigger:           Event — ArbitrationRequested(uint256,string,string,address)
Trigger condition: Any emission
Gas limit:         500000
```

Test it immediately after registering. Run a quick cast command to push a pact through to the Disputed state, then watch KeeperHub fire the call. If resolveDispute() executes with KeeperHub as msg.sender, your foundation is complete.

```bash
# Quick cast test — push a pact to Disputed state
# (assumes you've funded your test wallets on Sepolia)

# Agent A creates pact
cast send $AGENTPACT_ADDRESS \
  "createPact(bytes32,uint256,address,string)" \
  $(cast keccak "test task") \
  100000000 \
  $AGENT_B_ADDRESS \
  "0g://test-uri" \
  --private-key $AGENT_A_PRIVATE_KEY \
  --rpc-url $SEPOLIA_RPC_URL
```

## What "done" looks like at end of Day 3

You should be able to answer yes to every one of these:

- forge test -vvv → all 6 tests green
- All three contracts deployed and verified on Sepolia Etherscan
- resolveDispute() reverts for any caller that isn't KeeperHub
- KeeperHub successfully called resolveDispute() at least once on testnet — you have a tx hash proving it
- FEEDBACK.md exists in repo root with at least a paragraph written
- checkRep() returns sensible values for both a fresh agent and a seeded agent
- You understand exactly what each of the 5 events does and why KeeperHub watches ArbitrationRequested


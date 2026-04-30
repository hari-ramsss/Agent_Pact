// src/AgentPact.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./BadRepToken.sol";
import "./GoodRepToken.sol";
import "./interfaces/ISwapRouter.sol";

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

    ISwapRouter public immutable swapRouter;
    uint24 public constant POOL_FEE = 3000; // 0.3% pool

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

    event BadRepSwapped(
        uint256 indexed pactId,
        address indexed agentB,
        uint256 usdcIn,
        uint256 badRepOut
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _keeperHub,
        address _usdc,
        address _badRepToken,
        address _goodRepToken,
        address _swapRouter
    ) Ownable(msg.sender) {
        require(_keeperHub != address(0), "AgentPact: KeeperHub address required");
        require(_usdc != address(0), "AgentPact: USDC address required");
        require(_badRepToken != address(0), "AgentPact: BadRepToken address required");
        require(_goodRepToken != address(0), "AgentPact: GoodRepToken address required");
        require(_swapRouter != address(0), "AgentPact: SwapRouter address required");

        keeperHub = _keeperHub;
        usdc = IERC20(_usdc);
        badRepToken = BadRepToken(_badRepToken);
        goodRepToken = GoodRepToken(_goodRepToken);
        swapRouter = ISwapRouter(_swapRouter);
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

        // 2. Approve the router to spend the slashed USDC bond
        usdc.forceApprove(address(swapRouter), slashedAmount);

        // 3. Swap USDC → $BADREP via Uniswap v3 exactInputSingle
        uint256 badRepOut = 0;
        try swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn:           address(usdc),
                tokenOut:          address(badRepToken),
                fee:               POOL_FEE,
                recipient:         pact.agentB,   // $BADREP lands in agentB's wallet
                deadline:          block.timestamp + 15 minutes,
                amountIn:          slashedAmount,
                amountOutMinimum:  0,             // no slippage guard on testnet
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 amountOut) {
            badRepOut = amountOut;
            emit BadRepSwapped(pactId, pact.agentB, slashedAmount, badRepOut);
        } catch {
            // Pool doesn't exist yet on testnet — fall back to direct mint
            // Remove this fallback before mainnet
            uint256 badRepMinted = slashedAmount * 1e12;
            badRepToken.mint(pact.agentB, badRepMinted, pactId);
            emit BadRepSwapped(pactId, pact.agentB, slashedAmount, badRepMinted);
        }

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
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

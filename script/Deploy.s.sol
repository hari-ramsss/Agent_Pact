// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/AgentPact.sol";
import "../src/BadRepToken.sol";
import "../src/GoodRepToken.sol";
import "../src/GoodRepYieldHook.sol";
import "../src/AgentPactRegistry.sol";
import "../src/mocks/MockPoolManager.sol";
import "../src/mocks/MockSwapRouter.sol";

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

        // 1b. Deploy MockSwapRouter
        MockSwapRouter mockRouter = new MockSwapRouter();
        console.log("MockSwapRouter deployed at:", address(mockRouter));

        // 1c. Deploy mock v4 PoolManager + GOODREP yield hook for testnet/demo
        MockPoolManager poolManager = new MockPoolManager();
        GoodRepYieldHook yieldHook = new GoodRepYieldHook(
            address(poolManager),
            goodRep,
            SEPOLIA_USDC
        );
        console.log("MockPoolManager deployed at:", address(poolManager));
        console.log("GoodRepYieldHook deployed at:", address(yieldHook));

        // 2. Deploy main contract
        AgentPact agentPact = new AgentPact(
            keeperHubAddress,
            SEPOLIA_USDC,
            address(badRep),
            address(goodRep),
            address(mockRouter)
        );
        console.log("AgentPact    deployed at:", address(agentPact));

        // 2b. Deploy ecosystem registry
        AgentPactRegistry registry = new AgentPactRegistry();
        console.log("AgentPactRegistry deployed at:", address(registry));

        // 3. Wire minters — must happen right after deployment
        badRep.setMinter(address(agentPact));
        goodRep.setMinter(address(agentPact));
        goodRep.setYieldHook(address(yieldHook));
        // Grant MockSwapRouter minting rights by making it the owner
        badRep.transferOwnership(address(mockRouter));
        console.log("Minters and yield hook set successfully");

        vm.stopBroadcast();

        // Print .env update instructions
        console.log("\n=== UPDATE YOUR .env FILE ===");
        console.log("AGENTPACT_ADDRESS=", address(agentPact));
        console.log("BADREP_TOKEN_ADDRESS=", address(badRep));
        console.log("GOODREP_TOKEN_ADDRESS=", address(goodRep));
        console.log("REGISTRY_ADDRESS=", address(registry));
        console.log("MOCK_SWAP_ROUTER=", address(mockRouter));
        console.log("V4_POOL_MANAGER=", address(poolManager));
        console.log("GOODREP_YIELD_HOOK=", address(yieldHook));
    }
}

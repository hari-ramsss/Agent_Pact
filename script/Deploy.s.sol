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

        // 1b. Use real Sepolia Uniswap V3 SwapRouter02
        address swapRouter = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
        console.log("Real SwapRouter being used at:", swapRouter);

        // 1c. Use real Sepolia v4 PoolManager + deploy GOODREP yield hook
        address poolManager = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
        GoodRepYieldHook yieldHook = new GoodRepYieldHook(
            poolManager,
            goodRep,
            SEPOLIA_USDC
        );
        console.log("Real PoolManager being used at:", poolManager);
        console.log("GoodRepYieldHook deployed at:", address(yieldHook));

        // 2. Deploy main contract
        AgentPact agentPact = new AgentPact(
            keeperHubAddress,
            SEPOLIA_USDC,
            address(badRep),
            address(goodRep),
            swapRouter
        );
        console.log("AgentPact    deployed at:", address(agentPact));

        // 2b. Deploy ecosystem registry
        AgentPactRegistry registry = new AgentPactRegistry();
        console.log("AgentPactRegistry deployed at:", address(registry));

        // 3. Wire minters — must happen right after deployment
        badRep.setMinter(address(agentPact));
        goodRep.setMinter(address(agentPact));
        goodRep.setYieldHook(address(yieldHook));
        // Ownership remains with deployer for now
        console.log("Minters and yield hook set successfully");

        vm.stopBroadcast();

        // Print .env update instructions
        console.log("\n=== UPDATE YOUR .env FILE ===");
        console.log("AGENTPACT_ADDRESS=", address(agentPact));
        console.log("BADREP_TOKEN_ADDRESS=", address(badRep));
        console.log("GOODREP_TOKEN_ADDRESS=", address(goodRep));
        console.log("REGISTRY_ADDRESS=", address(registry));
        console.log("MOCK_SWAP_ROUTER=", swapRouter);
        console.log("V4_POOL_MANAGER=", poolManager);
        console.log("GOODREP_YIELD_HOOK=", address(yieldHook));
    }
}

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
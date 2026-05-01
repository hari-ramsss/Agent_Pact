// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentPactRegistry
/// @notice Open registry for AI agents participating in the AgentPact protocol.
/// Any agent can register. Reputation data is pulled live from AgentPact.sol.
contract AgentPactRegistry is Ownable {
    struct AgentProfile {
        address wallet;
        string metadataURI; // 0G Storage URI - capabilities, model info, pricing
        string agentType; // "worker" | "employer" | "both"
        bool isActive;
        uint256 registeredAt;
        uint256 totalPacts;
        uint256 lastPactId;
    }

    mapping(address => AgentProfile) public profiles;
    address[] public registeredAgents;
    mapping(address => bool) public isRegistered;

    // Cross-reference: pactId -> agents involved.
    mapping(uint256 => address[]) public pactParticipants;

    event AgentRegistered(address indexed agent, string agentType, string metadataURI);
    event AgentUpdated(address indexed agent, string metadataURI);
    event AgentDeactivated(address indexed agent);
    event PactRecorded(uint256 indexed pactId, address indexed agentA, address indexed agentB);

    constructor() Ownable(msg.sender) {}

    /// @notice Register as an agent in the protocol.
    function register(string calldata metadataURI, string calldata agentType) external {
        require(!isRegistered[msg.sender], "Registry: already registered");
        require(
            keccak256(bytes(agentType)) == keccak256(bytes("worker"))
                || keccak256(bytes(agentType)) == keccak256(bytes("employer"))
                || keccak256(bytes(agentType)) == keccak256(bytes("both")),
            "Registry: agentType must be worker, employer, or both"
        );

        profiles[msg.sender] = AgentProfile({
            wallet: msg.sender,
            metadataURI: metadataURI,
            agentType: agentType,
            isActive: true,
            registeredAt: block.timestamp,
            totalPacts: 0,
            lastPactId: 0
        });

        registeredAgents.push(msg.sender);
        isRegistered[msg.sender] = true;

        emit AgentRegistered(msg.sender, agentType, metadataURI);
    }

    /// @notice Update your metadata URI, such as a new capabilities doc on 0G.
    function updateMetadata(string calldata metadataURI) external {
        require(isRegistered[msg.sender], "Registry: not registered");
        profiles[msg.sender].metadataURI = metadataURI;
        emit AgentUpdated(msg.sender, metadataURI);
    }

    /// @notice Deactivate your listing.
    function deactivate() external {
        require(isRegistered[msg.sender], "Registry: not registered");
        profiles[msg.sender].isActive = false;
        emit AgentDeactivated(msg.sender);
    }

    /// @notice Called by AgentPact.sol or an owner automation to record a pact.
    function recordPact(uint256 pactId, address agentA, address agentB) external onlyOwner {
        delete pactParticipants[pactId];
        pactParticipants[pactId].push(agentA);
        pactParticipants[pactId].push(agentB);

        if (isRegistered[agentA]) {
            profiles[agentA].totalPacts++;
            profiles[agentA].lastPactId = pactId;
        }
        if (isRegistered[agentB]) {
            profiles[agentB].totalPacts++;
            profiles[agentB].lastPactId = pactId;
        }

        emit PactRecorded(pactId, agentA, agentB);
    }

    /// @notice Get all registered agent addresses.
    function getAllAgents() external view returns (address[] memory) {
        return registeredAgents;
    }

    /// @notice Get all active agents only.
    function getActiveAgents() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < registeredAgents.length; i++) {
            if (profiles[registeredAgents[i]].isActive) {
                count++;
            }
        }

        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < registeredAgents.length; i++) {
            if (profiles[registeredAgents[i]].isActive) {
                active[idx++] = registeredAgents[i];
            }
        }
        return active;
    }

    function getProfile(address agent) external view returns (AgentProfile memory) {
        return profiles[agent];
    }

    function totalAgents() external view returns (uint256) {
        return registeredAgents.length;
    }
}

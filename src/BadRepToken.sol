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
        require(msg.sender == minter || msg.sender == owner(), "BadRepToken: caller is not the minter");
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
// src/GoodRepToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IGoodRepYieldHook.sol";

/**
 * @title GoodRepToken ($GOODREP)
 * @notice Non-transferable reputation reward token. Minted when an agent successfully
 *         completes a pact. Earns yield via Uniswap v4 hook (wired on Days 5-6).
 *         Non-transferable by design — reputation can't be bought or sold.
 *         Can only be earned by completing real work.
 */
contract GoodRepToken is ERC20, Ownable {
    address public minter;
    address public yieldHook;

    event MinterSet(address indexed newMinter);
    event YieldHookSet(address indexed newYieldHook);
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

    function setYieldHook(address _yieldHook) external onlyOwner {
        yieldHook = _yieldHook;
        emit YieldHookSet(_yieldHook);
    }

    function mint(address agent, uint256 amount, uint256 pactId) external onlyMinter {
        if (yieldHook != address(0)) {
            IGoodRepYieldHook(yieldHook).updateYield(agent);
        }
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

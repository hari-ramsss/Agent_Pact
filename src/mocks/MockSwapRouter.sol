// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../BadRepToken.sol";
import "../interfaces/ISwapRouter.sol";

/// @dev Mock Uniswap v3 Router for testnet demonstration.
/// Simulates a 1 USDC = 1e12 BADREP rate (matching the stub).
/// Replace with real SwapRouter address on mainnet/production.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut)
    {
        // Pull USDC from caller (AgentPact contract)
        IERC20(params.tokenIn).safeTransferFrom(
            msg.sender,
            address(this),    // mock "burns" it — escrow absorbs slashed bond
            params.amountIn
        );

        // Mint $BADREP directly to the penalized agent
        // Rate: 1 USDC (6 decimals) → 1e12 BADREP (18 decimals)
        amountOut = params.amountIn * 1e12;
        BadRepToken(params.tokenOut).mint(params.recipient, amountOut, 0);

        return amountOut;
    }
}

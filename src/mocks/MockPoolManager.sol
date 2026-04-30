// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GoodRepYieldHook.sol";

/// @dev Minimal v4 PoolManager stand-in for local tests and demos.
contract MockPoolManager {
    function simulateAfterSwap(
        GoodRepYieldHook hook,
        GoodRepYieldHook.PoolKey calldata key,
        GoodRepYieldHook.SwapParams calldata params
    ) external returns (bytes4, int128) {
        return hook.afterSwap(msg.sender, key, params, 0, "");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GoodRepToken.sol";

/// @title GoodRepYieldHook
/// @notice Mock-friendly Uniswap v4 afterSwap hook that accrues fee yield to GOODREP holders.
/// @dev The public structs mirror the v4 fields this project needs, while avoiding a hard
/// dependency on v4 packages in local demo/test environments where they are not installed.
contract GoodRepYieldHook is Ownable {
    using SafeERC20 for IERC20;

    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    struct HookPermissions {
        bool beforeInitialize;
        bool afterInitialize;
        bool beforeAddLiquidity;
        bool afterAddLiquidity;
        bool beforeRemoveLiquidity;
        bool afterRemoveLiquidity;
        bool beforeSwap;
        bool afterSwap;
        bool beforeDonate;
        bool afterDonate;
    }

    address public immutable poolManager;
    GoodRepToken public immutable goodRepToken;
    IERC20 public immutable yieldToken;

    uint256 public yieldFeeBps = 1000;
    uint256 public accYieldPerToken;

    mapping(address => uint256) public yieldDebt;
    mapping(address => uint256) public pendingYield;

    event YieldAccrued(uint256 feeSlice, uint256 newAccYieldPerToken);
    event YieldClaimed(address indexed agent, uint256 amount);
    event YieldFeeBpsSet(uint256 bps);

    modifier onlyPoolManager() {
        require(msg.sender == poolManager, "GoodRepYieldHook: only pool manager");
        _;
    }

    constructor(
        address _poolManager,
        GoodRepToken _goodRepToken,
        address _yieldToken
    ) Ownable(msg.sender) {
        require(_poolManager != address(0), "GoodRepYieldHook: pool manager required");
        require(address(_goodRepToken) != address(0), "GoodRepYieldHook: GOODREP required");
        require(_yieldToken != address(0), "GoodRepYieldHook: yield token required");

        poolManager = _poolManager;
        goodRepToken = _goodRepToken;
        yieldToken = IERC20(_yieldToken);
    }

    function getHookPermissions() external pure returns (HookPermissions memory) {
        return HookPermissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false
        });
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        int256,
        bytes calldata
    ) external onlyPoolManager returns (bytes4, int128) {
        if (key.currency0 != address(goodRepToken) && key.currency1 != address(goodRepToken)) {
            return (GoodRepYieldHook.afterSwap.selector, 0);
        }

        uint256 swapAmount = params.amountSpecified < 0
            ? uint256(-params.amountSpecified)
            : uint256(params.amountSpecified);

        uint256 poolFee = (swapAmount * key.fee) / 1_000_000;
        uint256 feeSlice = (poolFee * yieldFeeBps) / 10_000;

        if (feeSlice > 0) {
            _accrueYield(feeSlice);
        }

        return (GoodRepYieldHook.afterSwap.selector, 0);
    }

    function updateYield(address agent) public {
        uint256 balance = goodRepToken.balanceOf(agent);
        uint256 accumulated = (balance * accYieldPerToken) / 1e18;
        uint256 debt = yieldDebt[agent];

        if (accumulated > debt) {
            pendingYield[agent] += accumulated - debt;
        }

        yieldDebt[agent] = accumulated;
    }

    function claimYield() external {
        updateYield(msg.sender);

        uint256 amount = pendingYield[msg.sender];
        require(amount > 0, "GoodRepYieldHook: nothing to claim");

        pendingYield[msg.sender] = 0;
        yieldToken.safeTransfer(msg.sender, amount);

        uint256 balance = goodRepToken.balanceOf(msg.sender);
        yieldDebt[msg.sender] = (balance * accYieldPerToken) / 1e18;

        emit YieldClaimed(msg.sender, amount);
    }

    function setYieldFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 5000, "GoodRepYieldHook: max 50%");
        yieldFeeBps = _bps;
        emit YieldFeeBpsSet(_bps);
    }

    function depositYield(uint256 amount) external {
        yieldToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function _accrueYield(uint256 feeSlice) internal {
        uint256 totalSupply = goodRepToken.totalSupply();
        if (totalSupply == 0) {
            return;
        }

        accYieldPerToken += (feeSlice * 1e18) / totalSupply;
        emit YieldAccrued(feeSlice, accYieldPerToken);
    }
}

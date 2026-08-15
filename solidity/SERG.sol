// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SERG — Sidechain ERG
 * @notice ERC-20 representation of ERG locked on the Ergo mainchain.
 * @dev Only the bridge contract (owner) can mint and burn.
 *      1 sERG = 1 ERG locked in MainChainLock.es on Ergo L1.
 *      Uses 9 decimals to match Ergo's nanoERG (1 ERG = 10^9 nanoERG).
 */
contract SERG is ERC20, Ownable {
    constructor() ERC20("Sidechain ERG", "sERG") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 9; // Match nanoERG precision
    }

    /**
     * @notice Mint sERG after verifying ERG lock on mainchain.
     * @param to     EVM address that locked ERG (from R4 of MainChainLock box)
     * @param amount Amount in nanoERG precision (10^9 = 1 sERG)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn sERG to initiate peg-out (sERG → ERG).
     * @param amount Amount to burn. Must be called by the token holder.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /**
     * @notice Bridge-initiated burn during atomic peg-out.
     * @dev Only callable by the bridge contract (owner).
     *      This enables the bridge to atomically burn + emit PegOut in one TX,
     *      preventing the infinite-drain attack where PegOut is emitted without burn.
     * @param account The account whose sERG will be burned
     * @param amount  Amount to burn (nanoERG precision)
     */
    function bridgeBurn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
}

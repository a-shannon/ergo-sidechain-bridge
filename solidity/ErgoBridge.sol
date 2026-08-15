// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISERG {
    function mint(address to, uint256 amount) external;
    function bridgeBurn(address account, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title ErgoBridge — Sidechain ↔ Ergo L1 Bridge Relay
 * @notice Manages sidechain state updates and peg-out requests.
 * @dev Phase 1: Single relayer (owner). Phase 010a: atLeast() on-chain multisig committee.
 *
 * State tracking:
 *   - ergoStateRoots: maps Ergo block height → UTXO set root
 *   - latestErgoHeight: last synced Ergo height
 *
 * Events:
 *   - PegOut: emitted when user burns sERG (relayer watches this)
 *   - StateUpdated: emitted when relayer syncs Ergo state
 *   - EmergencyPaused: emitted when solvency invariant breaks
 */
contract ErgoBridge is Ownable {
    // --- State ---
    mapping(uint256 => bytes32) public ergoStateRoots;
    uint256 public latestErgoHeight;
    address public sergToken;
    bool public paused;

    // --- On-Chain Deduplication ---
    // 🚨 ANTI-AMNESIA: Prevents double-minting if daemon restarts from stale SQLite.
    // Maps Ergo boxId (bytes32) → true if already minted.
    mapping(bytes32 => bool) public processedPegIns;

    // --- Bridge Fee Economics ---
    // 🚨 FEE DRAIN DEFENSE: Without a bridge fee, an attacker can trigger 10,000
    // micro peg-outs on EVM (cheap gas) forcing the relayer to pay 10,000 × 0.002 ERG
    // in L1 miner fees from its own wallet. Asymmetric griefing attack.
    // The bridge fee is deducted from the burned amount and accumulated here.
    // The relayer owner can withdraw fees to refill the L1 hot wallet.
    uint256 public constant BRIDGE_FEE_NANOERG = 5_000_000; // 0.005 ERG per peg-out
    uint256 public constant MINIMUM_PEG_OUT = 10_000_000;   // 0.01 ERG minimum
    uint256 public accumulatedFees;

    // --- Events ---
    event PegOut(
        address indexed user,
        uint256 amount,
        bytes ergoRecipientPubKey  // Compressed pubkey (33 bytes) or ErgoTree
    );

    event StateUpdated(
        uint256 indexed ergoHeight,
        bytes32 utxoRoot
    );

    event EmergencyPaused(string reason);

    // --- Modifiers ---
    modifier whenNotPaused() {
        require(!paused, "Bridge: paused");
        _;
    }

    // --- Constructor ---
    constructor(address _sergToken) Ownable(msg.sender) {
        sergToken = _sergToken;
        paused = false;
    }

    // --- Relayer Functions ---

    /**
     * @notice Update Ergo mainchain state (called by relayer after each Ergo block).
     * @param height  Ergo block height
     * @param utxoRoot UTXO set digest from SideChainState.es R6
     */
    function updateErgoState(
        uint256 height,
        bytes32 utxoRoot
    ) external onlyOwner whenNotPaused {
        require(height > latestErgoHeight, "Bridge: stale height");
        ergoStateRoots[height] = utxoRoot;
        latestErgoHeight = height;
        emit StateUpdated(height, utxoRoot);
    }

    event PegIn(
        address indexed to,
        uint256 amount,
        bytes32 ergoBoxId
    );

    /**
     * @notice Mint sERG after verifying ERG lock on Ergo mainchain.
     * @param to        EVM address of the depositor
     * @param amount    Amount in nanoERG (sERG has 9 decimals)
     * @param ergoBoxId The Ergo UTXO box ID that locked the ERG (32 bytes)
     *
     * @dev ON-CHAIN DEDUPLICATION: If the relayer crashes and restarts from a
     *      stale SQLite backup, it would rescan all unspent MainChainLock boxes
     *      and attempt to mint again for each one. Without on-chain dedup,
     *      this causes infinite sERG inflation.
     *      The processedPegIns mapping is the LAST LINE OF DEFENSE.
     */
    function mintSERG(
        address to,
        uint256 amount,
        bytes32 ergoBoxId
    ) external onlyOwner whenNotPaused {
        require(!processedPegIns[ergoBoxId], "Bridge: peg-in already processed");
        processedPegIns[ergoBoxId] = true;
        ISERG(sergToken).mint(to, amount);
        emit PegIn(to, amount, ergoBoxId);
    }

    // --- User Functions ---

    /**
     * @notice Atomically burn sERG and initiate peg-out.
     * @dev CRITICAL: The bridge MUST destroy tokens before emitting PegOut.
     *      Without atomic burn, users could emit PegOut without burning,
     *      causing the relayer to unlock ERG for non-existent burns
     *      (infinite drain attack).
     *
     *      A BRIDGE_FEE_NANOERG is deducted to cover L1 miner fees.
     *      The PegOut event emits the NET amount (after fee deduction).
     *
     *      User must first call sERG.approve(bridgeAddress, amount).
     *
     * @param amount             Total amount of sERG to burn (nanoERG precision)
     * @param ergoRecipientPubKey Compressed pubkey (33 bytes: 02/03 + x-coord)
     *                            or full ErgoTree bytes (36+ bytes).
     */
    function pegOut(
        uint256 amount,
        bytes calldata ergoRecipientPubKey
    ) external whenNotPaused {
        // Minimum ensures net amount (after fee) is still meaningful for L1 unlock
        require(amount >= MINIMUM_PEG_OUT + BRIDGE_FEE_NANOERG, "Bridge: below minimum (need >= 0.015 ERG to cover fee + min unlock)");
        // 🚨 STRICT P2PK VALIDATION: Only accept formats the relayer can actually
        // use to build an Ergo Phase 1 unlock TX. Without this, users can burn
        // sERG to an invalid/non-standard address — the sERG is destroyed but
        // the relayer rejects the peg-out, causing permanent fund loss.
        //
        // Accepted formats:
        //   33 bytes: compressed SEC1 pubkey (prefix 0x02 or 0x03 + 32-byte x-coord)
        //   36 bytes: P2PK ErgoTree (0x0008cd + 33-byte compressed pubkey)
        if (ergoRecipientPubKey.length == 33) {
            // Compressed pubkey: first byte must be 0x02 or 0x03
            require(
                ergoRecipientPubKey[0] == 0x02 || ergoRecipientPubKey[0] == 0x03,
                "Bridge: invalid pubkey prefix (need 0x02 or 0x03)"
            );
        } else if (ergoRecipientPubKey.length == 36) {
            // P2PK ErgoTree: must start with 0x0008cd
            require(
                ergoRecipientPubKey[0] == 0x00 &&
                ergoRecipientPubKey[1] == 0x08 &&
                ergoRecipientPubKey[2] == 0xcd,
                "Bridge: invalid ErgoTree prefix (need 0x0008cd)"
            );
            // Inner pubkey (bytes 3..35) must also have valid SEC1 prefix
            require(
                ergoRecipientPubKey[3] == 0x02 || ergoRecipientPubKey[3] == 0x03,
                "Bridge: invalid pubkey inside ErgoTree (need 0x02 or 0x03)"
            );
        } else {
            revert("Bridge: invalid recipient length (need 33-byte pubkey or 36-byte P2PK ErgoTree)");
        }

        // Deduct bridge fee (covers L1 Phase 1 + Phase 2 miner fees)
        uint256 netAmount = amount - BRIDGE_FEE_NANOERG;
        accumulatedFees += BRIDGE_FEE_NANOERG;

        // 🚨 CHAIN α DEFENSE: Burn ONLY the net amount (NOT the fee portion).
        //
        // OLD (BROKEN) DESIGN:
        //   bridgeBurn(user, amount)    ← burns ALL including fee
        //   withdrawFees() → mint(fees) ← RE-MINTS unbacked sERG!
        //   This violates the solvency invariant: totalSupply(sERG) > locked ERG
        //
        // NEW (FIXED) DESIGN:
        //   bridgeBurn(user, netAmount) ← burns only what gets unlocked on L1
        //   Fee sERG stays in circulation as escrowed balance on this contract
        //   withdrawFees() → transfer (no minting, supply stays constant)
        //
        // The fee sERG is backed by the fee ERG that remains locked on L1
        // (since we only unlock netAmount, the fee ERG stays in the vault).
        ISERG(sergToken).bridgeBurn(msg.sender, netAmount);

        // Transfer fee portion from user to this contract as escrow
        // User must have approved amount (not just netAmount) for this to work
        // 🚨 require() guards: ERC20 may return false instead of reverting
        require(
            ISERG(sergToken).transferFrom(msg.sender, address(this), BRIDGE_FEE_NANOERG),
            "Bridge: fee transfer failed"
        );

        // Emit NET amount — the relayer unlocks netAmount ERG on L1
        emit PegOut(msg.sender, netAmount, ergoRecipientPubKey);
    }

    /**
     * @notice Withdraw accumulated bridge fees as sERG to refill relayer wallet.
     *
     * 🚨 CHAIN α DEFENSE: This now TRANSFERS escrowed sERG, not MINT new ones.
     * The fee sERG was collected from users during pegOut() and held in escrow
     * on this contract. No new sERG is created — the supply invariant is preserved.
     *
     * The relayer can then pegOut() this sERG to convert back to ERG on L1
     * for covering miner fees.
     */
    function withdrawFees(address to) external onlyOwner {
        uint256 fees = accumulatedFees;
        require(fees > 0, "Bridge: no fees to withdraw");
        accumulatedFees = 0;
        // Transfer escrowed sERG — no minting, supply stays constant
        require(
            ISERG(sergToken).transfer(to, fees),
            "Bridge: fee withdrawal transfer failed"
        );
    }

    // --- Solvency Monitoring ---

    /**
     * @notice Get the bridge's escrowed sERG balance (from accumulated fees).
     * @dev The relayer monitors this to track available fee income.
     */
    function bridgeSERGBalance() external view returns (uint256) {
        return ISERG(sergToken).balanceOf(address(this));
    }

    /**
     * @notice Get total sERG supply (should always be <= ERG locked on L1).
     * @dev The solvency invariant: totalSupply(sERG) <= sum(MainChainLock boxes).
     *      The relayer checks this periodically and pauses if violated.
     */
    function totalSERGSupply() external view returns (uint256) {
        return ISERG(sergToken).totalSupply();
    }

    // --- Emergency ---

    /**
     * @notice Halt the bridge if solvency invariant breaks.
     *         Supply parity: totalSupply(sERG) <= ERG locked in vault
     */
    function emergencyPause(string calldata reason) external onlyOwner {
        paused = true;
        emit EmergencyPaused(reason);
    }

    function unpause() external onlyOwner {
        paused = false;
    }
}

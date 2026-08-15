# Walkthrough 001b — Solidity Contracts

> Sidechain EVM contracts: sERG ERC-20 token + ErgoBridge relay.
> To be deployed on the Substrate/Frontier EVM sidechain (Phase 002).

---

## Contract 1: SERG.sol — Sidechain ERG Token

**Purpose**: ERC-20 representation of ERG locked on Ergo L1. 1 sERG = 1 ERG.

**Design decisions**:
- 9 decimals (matching nanoERG: 1 ERG = 10^9 nanoERG)
- `Ownable` — only the ErgoBridge contract can mint
- Users can burn directly (no approval needed for own tokens)

```solidity
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

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
```

---

## Contract 2: ErgoBridge.sol — Bridge Relay

**Purpose**: State relay + PegOut event emission + emergency circuit breaker.

**Design decisions**:
- `updateErgoState()` — relayer pushes Ergo state roots (height → UTXO root mapping)
- `pegOut()` — emits `PegOut` event (relayer watches this for ERG unlock on L1)
- `emergencyPause()` — circuit breaker if supply parity invariant breaks
- Separation: `mintSERG()` is called by bridge, `burn()` is called by user on SERG directly

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISERG {
    function mint(address to, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title ErgoBridge — Sidechain ↔ Ergo L1 Bridge Relay
 * @notice Manages sidechain state updates and peg-out requests.
 * @dev Phase 1: Single relayer (owner). Phase 010: MPC/FROST committee.
 */
contract ErgoBridge is Ownable {
    // --- State ---
    mapping(uint256 => bytes32) public ergoStateRoots;
    uint256 public latestErgoHeight;
    address public sergToken;
    bool public paused;

    // --- Events ---
    event PegOut(
        address indexed user,
        uint256 amount,
        bytes32 ergoRecipientAddress  // Ergo P2PK address hash
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

    function updateErgoState(
        uint256 height,
        bytes32 utxoRoot
    ) external onlyOwner whenNotPaused {
        require(height > latestErgoHeight, "Bridge: stale height");
        ergoStateRoots[height] = utxoRoot;
        latestErgoHeight = height;
        emit StateUpdated(height, utxoRoot);
    }

    function mintSERG(
        address to,
        uint256 amount
    ) external onlyOwner whenNotPaused {
        ISERG(sergToken).mint(to, amount);
    }

    // --- User Functions ---

    function pegOut(
        uint256 amount,
        bytes32 ergoRecipientAddr
    ) external whenNotPaused {
        require(amount > 0, "Bridge: zero amount");
        emit PegOut(msg.sender, amount, ergoRecipientAddr);
    }

    // --- Emergency ---

    function emergencyPause(string calldata reason) external onlyOwner {
        paused = true;
        emit EmergencyPaused(reason);
    }

    function unpause() external onlyOwner {
        paused = false;
    }
}
```

> **Audit question for Deep Think**: `pegOut()` emits an event but doesn't burn sERG — the user must call `SERG.burn()` separately. Should `pegOut()` pull-and-burn atomically via `transferFrom`+`burn`? Otherwise a user could emit PegOut without actually burning, causing the relayer to unlock ERG for non-existent burns.

> **Audit question 2**: There's no solvency check in `mintSERG`. Should there be an on-chain cap enforced by the contract (e.g., max supply = locked ERG amount tracked via a state variable)?

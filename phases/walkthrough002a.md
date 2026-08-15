# Walkthrough 002a — Solidity Critical Fix (Audit Item #4)

> **Vulnerability**: `pegOut()` emitted `PegOut` event without burning sERG tokens.
> **Impact**: Infinite ERG drain — user calls `pegOut()` in a loop, relayer unlocks ERG each time, sERG supply never decreases.
> **Fix**: Atomic `bridgeBurn()` before `emit PegOut`.

---

## Attack Vector (Before Fix)

```
1. User holds 1 sERG
2. User calls ErgoBridge.pegOut(1 sERG, ergoAddr) — emits PegOut event
3. Relayer sees event → creates MainChainUnlock box → releases 1 ERG
4. User still holds 1 sERG (never burned!)
5. User repeats steps 2-4 indefinitely
6. Result: ERG vault drained, sERG supply unchanged
```

**Root cause**: `pegOut()` only emitted an event — the user was expected to call `SERG.burn()` separately, but nothing enforced this.

---

## Fix: SERG.sol — Added `bridgeBurn()`

The bridge contract (owner of SERG) can now burn tokens from any account atomically during `pegOut()`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SERG is ERC20, Ownable {
    constructor() ERC20("Sidechain ERG", "sERG") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 9;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Direct burn by token holder (voluntary)
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    /// @notice Bridge-initiated burn during atomic peg-out.
    /// @dev Only callable by the bridge contract (owner).
    ///      Prevents the infinite-drain attack where PegOut is emitted without burn.
    function bridgeBurn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
}
```

**Key design choice**: `bridgeBurn` does NOT require `allowance` — the bridge is the `owner` of the SERG contract, so it has privileged burn rights. The user only needs to hold sufficient balance; no `approve()` call is needed.

> **Audit question for Deep Think**: Is `bridgeBurn` without allowance check a security concern? The bridge contract is the ONLY address that can call it (Ownable). But if the bridge contract is compromised, it could burn any user's sERG. This is already true for `mint()` — a compromised bridge can inflate supply. The threat model assumes the bridge owner key is the relayer's hot wallet, which will be replaced by FROST/TSS in Phase 010.

---

## Fix: ErgoBridge.sol — Atomic burn-then-emit

The `ISERG` interface now exposes `bridgeBurn`, and `pegOut()` calls it before emitting the event.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISERG {
    function mint(address to, uint256 amount) external;
    function bridgeBurn(address account, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

contract ErgoBridge is Ownable {
    mapping(uint256 => bytes32) public ergoStateRoots;
    uint256 public latestErgoHeight;
    address public sergToken;
    bool public paused;

    event PegOut(
        address indexed user,
        uint256 amount,
        bytes32 ergoRecipientAddress
    );
    event StateUpdated(uint256 indexed ergoHeight, bytes32 utxoRoot);
    event EmergencyPaused(string reason);

    modifier whenNotPaused() {
        require(!paused, "Bridge: paused");
        _;
    }

    constructor(address _sergToken) Ownable(msg.sender) {
        sergToken = _sergToken;
        paused = false;
    }

    function updateErgoState(
        uint256 height, bytes32 utxoRoot
    ) external onlyOwner whenNotPaused {
        require(height > latestErgoHeight, "Bridge: stale height");
        ergoStateRoots[height] = utxoRoot;
        latestErgoHeight = height;
        emit StateUpdated(height, utxoRoot);
    }

    function mintSERG(
        address to, uint256 amount
    ) external onlyOwner whenNotPaused {
        ISERG(sergToken).mint(to, amount);
    }

    /// @notice Atomically burn sERG and initiate peg-out.
    /// @dev CRITICAL: The bridge MUST destroy tokens BEFORE emitting PegOut.
    ///      Without atomic burn, users could emit PegOut without burning,
    ///      causing the relayer to unlock ERG for non-existent burns
    ///      (infinite drain attack).
    function pegOut(
        uint256 amount, bytes32 ergoRecipientAddr
    ) external whenNotPaused {
        require(amount > 0, "Bridge: zero amount");

        // 🚨 ATOMIC BURN: Destroy tokens BEFORE emitting event.
        // bridgeBurn calls _burn(msg.sender, amount) on the SERG contract.
        // Reverts if user has insufficient balance.
        ISERG(sergToken).bridgeBurn(msg.sender, amount);

        emit PegOut(msg.sender, amount, ergoRecipientAddr);
    }

    function emergencyPause(string calldata reason) external onlyOwner {
        paused = true;
        emit EmergencyPaused(reason);
    }

    function unpause() external onlyOwner {
        paused = false;
    }
}
```

---

## Post-Fix Attack Flow

```
1. User holds 1 sERG
2. User calls ErgoBridge.pegOut(1 sERG, ergoAddr)
3. Bridge calls SERG.bridgeBurn(user, 1 sERG) — balance decreases to 0
4. Bridge emits PegOut(user, 1 sERG, ergoAddr)
5. Relayer sees event → unlocks 1 ERG on Ergo
6. User has 0 sERG — cannot repeat
7. Supply parity invariant holds: totalSupply(sERG) ≤ ERG_vault_balance ✅
```

> **Remaining audit question**: Should the relayer also verify `totalSupply(sERG)` after processing each PegOut to double-check the invariant holds? This would add a defensive solvency check at the relayer level, independent of the contract-level guarantee.

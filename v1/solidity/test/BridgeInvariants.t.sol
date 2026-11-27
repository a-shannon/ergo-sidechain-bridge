// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../SERG.sol";
import "../ErgoBridge.sol";
import "../BridgeCommitteeTimelock.sol";

interface Vm {
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
    function roll(uint256 newBlockNumber) external;
    function expectRevert(bytes calldata revertData) external;
    function expectRevert() external;
}

/**
 * @title BridgeInvariantHandler
 * @notice Stateful fuzzing driver for Foundry invariant testing across SERG,
 *         ErgoBridge, and BridgeCommitteeTimelock.
 */
contract BridgeInvariantHandler {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SERG public immutable serg;
    ErgoBridge public immutable bridge;
    BridgeCommitteeTimelock public immutable timelock;

    address public immutable mintOperator;
    address public immutable c1;
    address public immutable c2;
    address public immutable c3;
    address public immutable feeCollector;
    address[3] public users;

    // Valid compressed secp256k1 generator point G (0x02 || Gx)
    bytes public constant VALID_SECP256K1_PUBKEY =
        hex"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

    uint256 public ghostTotalMinted;
    uint256 public ghostTotalNetBurned;
    uint256 public ghostTotalFeesAccrued;
    uint256 public ghostTotalFeesWithdrawn;
    uint256 public ghostMintSeq;

    constructor(
        SERG _serg,
        ErgoBridge _bridge,
        BridgeCommitteeTimelock _timelock,
        address _mintOperator,
        address _c1,
        address _c2,
        address _c3,
        address _feeCollector,
        address[3] memory _users
    ) {
        serg = _serg;
        bridge = _bridge;
        timelock = _timelock;
        mintOperator = _mintOperator;
        c1 = _c1;
        c2 = _c2;
        c3 = _c3;
        feeCollector = _feeCollector;
        users = _users;
    }

    function mint(uint8 userIdx, uint256 rawAmount) external {
        if (bridge.paused()) return;
        address recipient = users[userIdx % users.length];
        // Bound to realistic nanoERG range (0.01 ERG .. 10,000 ERG)
        uint256 amount = 10_000_000 + (rawAmount % 10_000_000_000_000);
        bytes32 boxId = keccak256(abi.encode("pegin", ++ghostMintSeq, recipient, amount));

        vm.prank(mintOperator);
        timelock.relayMintSERG(recipient, amount, boxId);
        ghostTotalMinted += amount;
    }

    function pegOut(uint8 userIdx, uint256 rawAmount) external {
        if (bridge.paused()) return;
        address user = users[userIdx % users.length];
        uint256 bal = serg.balanceOf(user);
        uint256 minGross = bridge.MINIMUM_PEG_OUT() + bridge.BRIDGE_FEE_NANOERG();
        if (bal < minGross) return;

        uint256 span = bal - minGross;
        uint256 gross = minGross + (span > 0 ? rawAmount % (span + 1) : 0);
        uint256 fee = bridge.BRIDGE_FEE_NANOERG();
        uint256 net = gross - fee;

        vm.prank(user);
        serg.approve(address(bridge), gross);
        vm.prank(user);
        bridge.pegOut(gross, VALID_SECP256K1_PUBKEY);

        ghostTotalNetBurned += net;
        ghostTotalFeesAccrued += fee;
    }

    function timelockedWithdrawFees(bytes32 salt) external {
        uint256 fees = bridge.accumulatedFees();
        if (fees == 0) return;

        bytes memory data = abi.encodeWithSelector(bridge.withdrawFees.selector, feeCollector);
        vm.prank(c1);
        bytes32 actionId = timelock.proposeAction(address(bridge), data, salt);
        vm.prank(c2);
        timelock.confirmAction(actionId);

        vm.warp(block.timestamp + timelock.adminDelaySeconds());
        timelock.executeAction(actionId);
        ghostTotalFeesWithdrawn += fees;
    }

    function pauseAndTimelockedUnpause(bytes32 salt) external {
        if (!bridge.paused()) {
            vm.prank(c3);
            timelock.emergencyPause("fuzz drill");
        } else {
            bytes memory data = abi.encodeWithSelector(bridge.unpause.selector);
            vm.prank(c1);
            bytes32 actionId = timelock.proposeAction(address(bridge), data, salt);
            vm.prank(c2);
            timelock.confirmAction(actionId);
            vm.warp(block.timestamp + timelock.adminDelaySeconds());
            timelock.executeAction(actionId);
        }
    }

    function advanceBlock() external {
        vm.roll(block.number + 1);
    }
}

/**
 * @title BridgeInvariantsTest
 * @notice Foundry stateless fuzzing + stateful invariant verification suite for
 *         SERG.sol, ErgoBridge.sol, and BridgeCommitteeTimelock.sol.
 */
contract BridgeInvariantsTest {
    bool public constant IS_TEST = true;
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SERG internal serg;
    ErgoBridge internal bridge;
    BridgeCommitteeTimelock internal timelock;
    BridgeInvariantHandler internal handler;

    address internal constant C1 = address(0x1001);
    address internal constant C2 = address(0x1002);
    address internal constant C3 = address(0x1003);
    address internal constant MINT_OP = address(0x2001);
    address internal constant FEE_COLLECTOR = address(0x3001);
    address internal constant USER_A = address(0x4001);
    address internal constant USER_B = address(0x4002);
    address internal constant USER_C = address(0x4003);

    bytes internal constant VALID_PUBKEY =
        hex"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

    uint256 internal constant ADMIN_DELAY = 3600; // 1 hour

    function setUp() public {
        serg = new SERG();
        bridge = new ErgoBridge(address(serg));
        serg.transferOwnership(address(bridge));

        address[] memory members = new address[](3);
        members[0] = C1;
        members[1] = C2;
        members[2] = C3;

        timelock = new BridgeCommitteeTimelock(
            address(bridge),
            members,
            2,
            ADMIN_DELAY,
            MINT_OP
        );
        bridge.transferOwnership(address(timelock));

        address[3] memory users = [USER_A, USER_B, USER_C];
        handler = new BridgeInvariantHandler(
            serg,
            bridge,
            timelock,
            MINT_OP,
            C1,
            C2,
            C3,
            FEE_COLLECTOR,
            users
        );
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    // =========================================================================
    // Stateful Invariants (checked across randomized handler call sequences)
    // =========================================================================

    function invariant_exactSupplyConservation() public view {
        uint256 expectedSupply = handler.ghostTotalMinted() - handler.ghostTotalNetBurned();
        require(serg.totalSupply() == expectedSupply, "INV-EVM-01: totalSupply drift");
        require(serg.totalSupply() <= handler.ghostTotalMinted(), "INV-EVM-02: supply exceeds minted");
    }

    function invariant_feeEscrowParity() public view {
        uint256 expectedFees = handler.ghostTotalFeesAccrued() - handler.ghostTotalFeesWithdrawn();
        require(bridge.accumulatedFees() == expectedFees, "INV-EVM-03: accumulatedFees drift");
        require(bridge.bridgeSERGBalance() >= bridge.accumulatedFees(), "INV-EVM-04: fee escrow underfunded");
    }

    function invariant_ownershipImmutableUnderOperations() public view {
        require(serg.owner() == address(bridge), "INV-EVM-05: SERG owner changed");
        require(bridge.owner() == address(timelock), "INV-EVM-06: ErgoBridge owner changed");
    }

    // =========================================================================
    // Stateless Fuzz Tests (256+ randomized runs each)
    // =========================================================================

    function testFuzz_mintPegOutAndFeeWithdrawPreservesSupply(
        uint256 mintRaw,
        uint256 burnRaw,
        bytes32 boxId
    ) public {
        uint256 minGross = bridge.MINIMUM_PEG_OUT() + bridge.BRIDGE_FEE_NANOERG();
        uint256 mintAmt = minGross + (mintRaw % 1_000_000_000_000);
        uint256 burnGross = minGross + (burnRaw % (mintAmt - minGross + 1));
        uint256 fee = bridge.BRIDGE_FEE_NANOERG();
        uint256 net = burnGross - fee;

        vm.prank(MINT_OP);
        timelock.relayMintSERG(USER_A, mintAmt, boxId);
        require(serg.totalSupply() == mintAmt, "supply after mint mismatch");

        vm.prank(USER_A);
        serg.approve(address(bridge), burnGross);
        vm.prank(USER_A);
        bridge.pegOut(burnGross, VALID_PUBKEY);

        uint256 supplyAfterBurn = serg.totalSupply();
        require(supplyAfterBurn == mintAmt - net, "supply after pegOut mismatch");
        require(bridge.accumulatedFees() == fee, "fee accounting mismatch");
        require(bridge.bridgeSERGBalance() == fee, "escrow balance mismatch");

        // Timelocked fee withdrawal MUST NOT mint or alter totalSupply (Chain alpha defense)
        bytes memory data = abi.encodeWithSelector(bridge.withdrawFees.selector, FEE_COLLECTOR);
        vm.prank(C1);
        bytes32 actionId = timelock.proposeAction(address(bridge), data, boxId);
        vm.prank(C2);
        timelock.confirmAction(actionId);
        vm.warp(block.timestamp + ADMIN_DELAY);
        timelock.executeAction(actionId);

        require(serg.totalSupply() == supplyAfterBurn, "withdrawFees mutated totalSupply");
        require(serg.balanceOf(FEE_COLLECTOR) == fee, "fee collector did not receive exact fees");
        require(bridge.accumulatedFees() == 0, "accumulatedFees not zeroed");
    }

    function testFuzz_duplicateBoxIdAlwaysReverts(
        uint256 a1Raw,
        uint256 a2Raw,
        bytes32 boxId
    ) public {
        uint256 a1 = 1 + (a1Raw % 1_000_000_000_000);
        uint256 a2 = 1 + (a2Raw % 1_000_000_000_000);

        vm.prank(MINT_OP);
        timelock.relayMintSERG(USER_A, a1, boxId);

        vm.prank(MINT_OP);
        vm.expectRevert(bytes("Bridge: peg-in already processed"));
        timelock.relayMintSERG(USER_B, a2, boxId);
    }

    function testFuzz_subMinimumPegOutAlwaysReverts(uint256 grossRaw) public {
        uint256 minGross = bridge.MINIMUM_PEG_OUT() + bridge.BRIDGE_FEE_NANOERG();
        uint256 gross = grossRaw % minGross; // strictly < 15_000_000

        vm.prank(MINT_OP);
        timelock.relayMintSERG(USER_A, minGross, keccak256(abi.encode("submin", grossRaw)));

        vm.prank(USER_A);
        serg.approve(address(bridge), minGross);
        vm.prank(USER_A);
        vm.expectRevert(
            bytes("Bridge: below minimum (need >= 0.015 ERG to cover fee + min unlock)")
        );
        bridge.pegOut(gross, VALID_PUBKEY);
    }

    function testFuzz_unauthorizedAndSingleCommitteeMintReverts(
        address caller,
        uint256 amtRaw,
        bytes32 boxId
    ) public {
        // Avoid pranking the Forge cheatcode address or the sole valid mintOperator
        if (caller == MINT_OP || caller == address(vm)) caller = C1;
        uint256 amt = 1 + (amtRaw % 1_000_000_000);

        vm.prank(caller);
        vm.expectRevert(bytes("Timelock: only mint operator"));
        timelock.relayMintSERG(USER_A, amt, boxId);
    }

    function testFuzz_timelockDelayAndGraceExpiryBoundaries(uint64 earlyDelta, uint64 lateDelta) public {
        bytes memory data = abi.encodeWithSelector(timelock.setMintOperator.selector, USER_C);
        vm.prank(C1);
        bytes32 actionId = timelock.proposeAction(address(timelock), data, bytes32(uint256(earlyDelta)));
        vm.prank(C2);
        timelock.confirmAction(actionId);

        uint256 readyAt = block.timestamp + ADMIN_DELAY;

        // Strictly before readyAt -> MUST revert!
        uint256 earlyTs = block.timestamp + (uint256(earlyDelta) % ADMIN_DELAY);
        vm.warp(earlyTs);
        vm.expectRevert(bytes("Timelock: delay not elapsed"));
        timelock.executeAction(actionId);

        // Strictly past readyAt + GRACE_PERIOD_SECONDS -> MUST revert!
        uint256 expiredTs = readyAt + timelock.GRACE_PERIOD_SECONDS() + 1 + (uint256(lateDelta) % 30 days);
        vm.warp(expiredTs);
        vm.expectRevert(bytes("Timelock: action expired"));
        timelock.executeAction(actionId);
    }

    function testFuzz_offCurveAndMalformedSecp256k1RecipientsRevert(
        uint8 rawPrefix,
        uint256 xOverflowOffset
    ) public {
        vm.prank(MINT_OP);
        timelock.relayMintSERG(USER_A, 100_000_000, keccak256(abi.encode("offcurve", rawPrefix, xOverflowOffset)));
        vm.prank(USER_A);
        serg.approve(address(bridge), 100_000_000);

        // 1. Fuzzed invalid SEC1 prefix (!= 0x02 && != 0x03) MUST revert
        uint8 badPrefix = (rawPrefix == 0x02 || rawPrefix == 0x03) ? 0x04 : rawPrefix;
        bytes memory wrongPrefix = abi.encodePacked(badPrefix, bytes32(uint256(1)));
        vm.prank(USER_A);
        vm.expectRevert(bytes("Bridge: invalid pubkey prefix (need 0x02 or 0x03)"));
        bridge.pegOut(20_000_000, wrongPrefix);

        // 2. Fuzzed x >= SECP256K1_P MUST revert
        uint256 secpP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
        uint256 badX = secpP + (xOverflowOffset % (type(uint256).max - secpP + 1));
        bytes memory overflowX33 = abi.encodePacked(uint8(0x02), bytes32(badX));
        vm.prank(USER_A);
        vm.expectRevert(bytes("Bridge: recipient pubkey not on secp256k1 curve"));
        bridge.pegOut(20_000_000, overflowX33);

        // 3. Known off-curve x = 5 (5^3 + 7 = 132 is a quadratic non-residue mod P) & x = 0 MUST revert
        bytes memory offCurve33 = abi.encodePacked(uint8(0x02), bytes32(uint256(5)));
        vm.prank(USER_A);
        vm.expectRevert(bytes("Bridge: recipient pubkey not on secp256k1 curve"));
        bridge.pegOut(20_000_000, offCurve33);

        bytes memory zeroX33 = abi.encodePacked(uint8(0x02), bytes32(uint256(0)));
        vm.prank(USER_A);
        vm.expectRevert(bytes("Bridge: recipient pubkey not on secp256k1 curve"));
        bridge.pegOut(20_000_000, zeroX33);
    }

    function test_renounceOwnershipDisabledOnBothContracts() public {
        vm.expectRevert(bytes("SERG: renounceOwnership disabled"));
        serg.renounceOwnership();

        vm.expectRevert(bytes("Bridge: renounceOwnership disabled"));
        bridge.renounceOwnership();
    }
}

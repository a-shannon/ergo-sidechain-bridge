// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IErgoBridgeAdmin {
    function mintSERG(address to, uint256 amount, bytes32 ergoBoxId) external;
    function updateErgoState(uint256 height, bytes32 utxoRoot) external;
    function emergencyPause(string calldata reason) external;
    function unpause() external;
    function withdrawFees(address to) external;
    function transferOwnership(address newOwner) external;
}

/**
 * @title BridgeCommitteeTimelock — On-Chain t-of-n Committee Multisig & Timelock Owner for ErgoBridge
 * @notice Eliminates single-EOA admin risk on Frontier EVM by owning ErgoBridge.sol:
 *         - Operational `relayMintSERG` / `relayUpdateErgoState` is restricted strictly to the
 *           designated `mintOperator` (NEVER 1-of-n individual committee members [H-4]).
 *         - Fast `emergencyPause(reason)` can be triggered immediately by ANY committee member
 *           or `mintOperator` with zero delay when solvency breaks.
 *         - All privileged admin actions (`withdrawFees`, `unpause`, `transferOwnership`,
 *           `setMintOperator`, `rescueERC20`) require `threshold`-of-`n` committee approval PLUS
 *           a mandatory on-chain `adminDelaySeconds` timelock, expire after `GRACE_PERIOD_SECONDS`
 *           ([M-3]), and can be canceled by `threshold` committee members prior to execution.
 */
contract BridgeCommitteeTimelock is ReentrancyGuard {
    uint256 public constant MAX_COMMITTEE_SIZE = 20;
    uint256 public constant MIN_ADMIN_DELAY_SECONDS = 1;
    uint256 public constant MAX_ADMIN_DELAY_SECONDS = 30 days;
    uint256 public constant GRACE_PERIOD_SECONDS = 7 days;

    address public immutable bridge;
    uint256 public immutable threshold;
    uint256 public immutable adminDelaySeconds;

    address[] private _committee;
    mapping(address => bool) public isCommitteeMember;
    address public mintOperator;

    struct QueuedAction {
        address target;
        address proposer;
        uint64 readyAt;
        uint32 confirmations;
        uint32 cancelConfirmations;
        bool quorumReached;
        bool executed;
        bool canceled;
        bytes data;
    }

    uint256 public actionCount;
    mapping(bytes32 => QueuedAction) public actions;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmedCancel;

    event MintOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event ERC20Rescued(address indexed token, address indexed to, uint256 amount);
    event ActionProposed(
        bytes32 indexed actionId,
        address indexed proposer,
        address indexed target,
        bytes data
    );
    event ActionConfirmed(
        bytes32 indexed actionId,
        address indexed member,
        uint32 confirmations,
        uint64 readyAt
    );
    event ActionExecuted(bytes32 indexed actionId, address indexed executor, address indexed target);
    event ActionCancelConfirmed(
        bytes32 indexed actionId,
        address indexed member,
        uint32 cancelConfirmations
    );
    event ActionCanceled(bytes32 indexed actionId, address indexed triggeredBy);

    modifier onlyCommittee() {
        require(isCommitteeMember[msg.sender], "Timelock: not committee member");
        _;
    }

    modifier onlyMintOperator() {
        require(
            mintOperator != address(0) && msg.sender == mintOperator,
            "Timelock: only mint operator"
        );
        _;
    }

    modifier onlyMintOperatorOrCommittee() {
        require(
            (mintOperator != address(0) && msg.sender == mintOperator) ||
                isCommitteeMember[msg.sender],
            "Timelock: unauthorized operator"
        );
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Timelock: self-call only");
        _;
    }

    constructor(
        address _bridge,
        address[] memory _members,
        uint256 _threshold,
        uint256 _adminDelaySeconds,
        address _mintOperator
    ) {
        require(_bridge != address(0), "Timelock: zero bridge address");
        require(
            _members.length >= 1 && _members.length <= MAX_COMMITTEE_SIZE,
            "Timelock: invalid committee size"
        );
        require(
            _threshold >= 1 && _threshold <= _members.length,
            "Timelock: invalid threshold"
        );
        require(
            _adminDelaySeconds >= MIN_ADMIN_DELAY_SECONDS &&
                _adminDelaySeconds <= MAX_ADMIN_DELAY_SECONDS,
            "Timelock: delay out of bounds"
        );

        bridge = _bridge;
        threshold = _threshold;
        adminDelaySeconds = _adminDelaySeconds;
        mintOperator = _mintOperator;

        for (uint256 i = 0; i < _members.length; i++) {
            address member = _members[i];
            require(
                member != address(0) && member != address(this) && member != _bridge,
                "Timelock: invalid committee member"
            );
            require(!isCommitteeMember[member], "Timelock: duplicate committee member");
            isCommitteeMember[member] = true;
            _committee.push(member);
        }

        emit MintOperatorUpdated(address(0), _mintOperator);
    }

    function committeeMembers() external view returns (address[] memory) {
        return _committee;
    }

    function committeeSize() external view returns (uint256) {
        return _committee.length;
    }

    // -------------------------------------------------------------------------
    // Operational Relayer & Emergency Brake Entrypoints
    // -------------------------------------------------------------------------

    /**
     * @notice Strictly restricted to designated `mintOperator` (never 1-of-n committee [H-4]).
     */
    function relayMintSERG(
        address to,
        uint256 amount,
        bytes32 ergoBoxId
    ) external onlyMintOperator nonReentrant {
        IErgoBridgeAdmin(bridge).mintSERG(to, amount, ergoBoxId);
    }

    function relayUpdateErgoState(
        uint256 height,
        bytes32 utxoRoot
    ) external onlyMintOperator nonReentrant {
        IErgoBridgeAdmin(bridge).updateErgoState(height, utxoRoot);
    }

    /**
     * @notice Immediate zero-delay emergency brake callable by any committee member or mintOperator.
     */
    function emergencyPause(
        string calldata reason
    ) external onlyMintOperatorOrCommittee nonReentrant {
        IErgoBridgeAdmin(bridge).emergencyPause(reason);
    }

    /**
     * @notice Rotate or disable the operational hot mintOperator via t-of-n timelocked self-call.
     */
    function setMintOperator(address newOperator) external onlySelf {
        address prev = mintOperator;
        mintOperator = newOperator;
        emit MintOperatorUpdated(prev, newOperator);
    }

    /**
     * @notice Recover ERC-20 tokens (e.g., sERG fees mistakenly withdrawn to timelock) via
     *         t-of-n timelocked self-call ([L-1]).
     */
    function rescueERC20(address token, address to, uint256 amount) external onlySelf {
        require(token != address(0) && to != address(0), "Timelock: zero rescue address");
        require(IERC20(token).transfer(to, amount), "Timelock: ERC20 rescue failed");
        emit ERC20Rescued(token, to, amount);
    }

    // -------------------------------------------------------------------------
    // t-of-n Committee Proposal, Timelock Queue, Execution & Quorum Cancel
    // -------------------------------------------------------------------------

    function proposeAction(
        address target,
        bytes calldata data,
        bytes32 salt
    ) external onlyCommittee returns (bytes32 actionId) {
        require(
            target == bridge || target == address(this),
            "Timelock: target must be bridge or timelock"
        );
        require(data.length >= 4, "Timelock: empty calldata");

        uint256 seq = actionCount++;
        actionId = keccak256(abi.encode(seq, target, data, salt));
        QueuedAction storage a = actions[actionId];
        require(a.target == address(0), "Timelock: action collision");

        a.target = target;
        a.proposer = msg.sender;
        a.data = data;
        a.confirmations = 1;
        hasConfirmed[actionId][msg.sender] = true;

        if (threshold == 1) {
            a.quorumReached = true;
            a.readyAt = uint64(block.timestamp + adminDelaySeconds);
        }

        emit ActionProposed(actionId, msg.sender, target, data);
        emit ActionConfirmed(actionId, msg.sender, 1, a.readyAt);
    }

    function confirmAction(bytes32 actionId) external onlyCommittee {
        QueuedAction storage a = actions[actionId];
        require(a.target != address(0), "Timelock: unknown action");
        require(!a.executed, "Timelock: already executed");
        require(!a.canceled, "Timelock: already canceled");
        require(!hasConfirmed[actionId][msg.sender], "Timelock: already confirmed");

        hasConfirmed[actionId][msg.sender] = true;
        a.confirmations += 1;

        if (!a.quorumReached && a.confirmations >= threshold) {
            a.quorumReached = true;
            a.readyAt = uint64(block.timestamp + adminDelaySeconds);
        }

        emit ActionConfirmed(actionId, msg.sender, a.confirmations, a.readyAt);
    }

    function executeAction(bytes32 actionId) external nonReentrant returns (bytes memory result) {
        QueuedAction storage a = actions[actionId];
        require(a.target != address(0), "Timelock: unknown action");
        require(!a.executed, "Timelock: already executed");
        require(!a.canceled, "Timelock: already canceled");
        require(a.quorumReached && a.confirmations >= threshold, "Timelock: insufficient confirmations");
        require(block.timestamp >= a.readyAt, "Timelock: delay not elapsed");
        require(
            block.timestamp <= uint256(a.readyAt) + GRACE_PERIOD_SECONDS,
            "Timelock: action expired"
        );

        a.executed = true;

        bool ok;
        (ok, result) = a.target.call(a.data);
        if (!ok) {
            if (result.length > 0) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
            revert("Timelock: target execution reverted");
        }

        emit ActionExecuted(actionId, msg.sender, a.target);
    }

    /**
     * @notice Cancel a pending action:
     *         - Before quorum (`!quorumReached`), the original proposer can cancel immediately.
     *         - Once quorum is reached, canceling requires `threshold` committee cancel confirmations.
     */
    function cancelAction(bytes32 actionId) external onlyCommittee {
        QueuedAction storage a = actions[actionId];
        require(a.target != address(0), "Timelock: unknown action");
        require(!a.executed, "Timelock: already executed");
        require(!a.canceled, "Timelock: already canceled");

        if (!a.quorumReached && msg.sender == a.proposer) {
            a.canceled = true;
            emit ActionCanceled(actionId, msg.sender);
            return;
        }

        require(!hasConfirmedCancel[actionId][msg.sender], "Timelock: cancel already confirmed");
        hasConfirmedCancel[actionId][msg.sender] = true;
        a.cancelConfirmations += 1;
        emit ActionCancelConfirmed(actionId, msg.sender, a.cancelConfirmations);

        if (a.cancelConfirmations >= threshold) {
            a.canceled = true;
            emit ActionCanceled(actionId, msg.sender);
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IConsentRegistry} from "./interfaces/IConsentRegistry.sol";

/// @title ConsentRegistry
/// @notice Source of truth for who consented to what (trd.md §3.1). Users sign grants and
/// withdrawals off chain (EIP-712); anyone may relay them, so users never hold gas. A relayer
/// cannot forge consent: no valid principal signature, no effect.
/// @dev No personal data is stored: addresses, hashes, purpose ids, status and expiry only.
contract ConsentRegistry is IConsentRegistry, EIP712 {
    /// @dev Numeric values are part of the spec (drd.md §2) and mirrored in shared/src/ledger.ts.
    enum Action {
        RegisterFiduciary,
        RegisterPurpose,
        RegisterProcessor,
        SetPurposeActive,
        Grant,
        Withdraw,
        Acknowledge
    }

    struct FiduciaryInfo {
        bool registered;
        bytes32 metaHash;
    }

    struct ProcessorInfo {
        bool registered;
        bytes32 metaHash;
    }

    error NotAdmin();
    error NotFiduciary();
    error NotProcessor();
    error ZeroAddress();
    error FiduciaryAlreadyRegistered(address fiduciary);
    error PurposeAlreadyRegistered(bytes32 purposeId);
    error ProcessorAlreadyRegistered(bytes32 purposeId, address processor);
    error UnknownPurpose(bytes32 purposeId);
    error WrongFiduciary();
    error PurposeInactive(bytes32 purposeId);
    error SignatureExpired(uint64 deadline);
    error InvalidNonce(uint256 expected, uint256 got);
    error InvalidExpiry(uint64 expiresAt);
    error InvalidSignature();
    error NotActive();
    error NotWithdrawn();
    error AlreadyAcknowledged();

    // Must equal the field names and order in shared/eip712.ts.
    bytes32 private constant GRANT_TYPEHASH = keccak256(
        "GrantConsent(address principal,address fiduciary,bytes32 purposeId,uint64 expiresAt,bytes32 noticeHash,uint256 nonce,uint64 deadline)"
    );
    bytes32 private constant WITHDRAW_TYPEHASH = keccak256(
        "WithdrawConsent(address principal,address fiduciary,bytes32 purposeId,uint256 nonce,uint64 deadline)"
    );

    address public immutable admin;
    bytes32 public ledgerHead;
    mapping(address principal => uint256) public nonces;
    mapping(address fiduciary => FiduciaryInfo) public fiduciaries;
    mapping(bytes32 purposeId => mapping(address processor => ProcessorInfo)) public processors;

    mapping(bytes32 purposeId => Purpose) private _purposes;
    // consentKey = keccak256(abi.encode(fiduciary, purposeId)) (drd.md §2)
    mapping(address principal => mapping(bytes32 consentKey => Consent)) private _consents;
    // The grant (Consent.noticeVersion) whose withdrawal each processor last acknowledged. Grants only ever
    // count up, so "acknowledged version < current version" means this withdrawal is still unacknowledged.
    mapping(address principal => mapping(bytes32 purposeId => mapping(address processor => uint32))) private _acknowledgedVersion;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyFiduciary() {
        if (!fiduciaries[msg.sender].registered) revert NotFiduciary();
        _;
    }

    constructor(address admin_) EIP712("Sammati", "1") {
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    // --- admin ---

    function registerFiduciary(address fiduciary, string calldata name, bytes32 metaHash) external onlyAdmin {
        if (fiduciary == address(0)) revert ZeroAddress();
        if (fiduciaries[fiduciary].registered) revert FiduciaryAlreadyRegistered(fiduciary);
        fiduciaries[fiduciary] = FiduciaryInfo({registered: true, metaHash: metaHash});
        _advanceLedger(Action.RegisterFiduciary, address(0), fiduciary, bytes32(0), 0);
        emit FiduciaryRegistered(fiduciary, name);
    }

    // --- fiduciary ---

    function registerPurpose(bytes32 purposeId, bytes32 descHash, uint32 retentionDays, bool shares)
        external
        onlyFiduciary
    {
        if (_purposes[purposeId].fiduciary != address(0)) revert PurposeAlreadyRegistered(purposeId);
        _purposes[purposeId] = Purpose({
            fiduciary: msg.sender,
            descHash: descHash,
            retentionDays: retentionDays,
            sharesWithThirdParties: shares,
            active: true
        });
        _advanceLedger(Action.RegisterPurpose, address(0), msg.sender, purposeId, 0);
        emit PurposeRegistered(msg.sender, purposeId, descHash);
    }

    function registerProcessor(bytes32 purposeId, address processor, bytes32 metaHash) external onlyFiduciary {
        _requireOwnPurpose(purposeId);
        if (processor == address(0)) revert ZeroAddress();
        if (processors[purposeId][processor].registered) revert ProcessorAlreadyRegistered(purposeId, processor);
        processors[purposeId][processor] = ProcessorInfo({registered: true, metaHash: metaHash});
        // The processor takes the principal slot: the registration has no data principal (drd.md §2).
        _advanceLedger(Action.RegisterProcessor, processor, msg.sender, purposeId, 0);
        emit ProcessorRegistered(purposeId, processor);
    }

    function setPurposeActive(bytes32 purposeId, bool active) external onlyFiduciary {
        _requireOwnPurpose(purposeId);
        _purposes[purposeId].active = active;
        _advanceLedger(Action.SetPurposeActive, address(0), msg.sender, purposeId, active ? 1 : 0);
        emit PurposeActiveChanged(msg.sender, purposeId, active);
    }

    // --- principal, via any relayer ---

    function grantConsent(GrantConsent calldata req, bytes calldata sig) external {
        if (block.timestamp > req.deadline) revert SignatureExpired(req.deadline);
        Purpose storage purpose = _purposes[req.purposeId];
        if (purpose.fiduciary == address(0)) revert UnknownPurpose(req.purposeId);
        if (purpose.fiduciary != req.fiduciary) revert WrongFiduciary();
        if (!purpose.active) revert PurposeInactive(req.purposeId);
        if (req.expiresAt <= block.timestamp) revert InvalidExpiry(req.expiresAt);
        _useNonce(req.principal, req.nonce);
        // A struct of static types encodes exactly like its fields in order, which is the EIP-712 structHash.
        _requireSigner(req.principal, _hashTypedDataV4(keccak256(abi.encode(GRANT_TYPEHASH, req))), sig);

        Consent storage c = _consents[req.principal][_consentKey(req.fiduciary, req.purposeId)];
        c.status = Status.Active;
        c.grantedAt = uint64(block.timestamp);
        c.expiresAt = req.expiresAt;
        c.updatedAt = uint64(block.timestamp);
        c.noticeHash = req.noticeHash;
        c.noticeVersion += 1;

        bytes32 head = _advanceLedger(Action.Grant, req.principal, req.fiduciary, req.purposeId, req.expiresAt);
        emit ConsentGranted(req.principal, req.fiduciary, req.purposeId, req.expiresAt, req.noticeHash, head);
    }

    /// @dev Withdrawal is immediate and unconditional: it ignores purpose activity and expiry.
    function withdrawConsent(WithdrawConsent calldata req, bytes calldata sig) external {
        if (block.timestamp > req.deadline) revert SignatureExpired(req.deadline);
        Consent storage c = _consents[req.principal][_consentKey(req.fiduciary, req.purposeId)];
        if (c.status != Status.Active) revert NotActive();
        _useNonce(req.principal, req.nonce);
        _requireSigner(req.principal, _hashTypedDataV4(keccak256(abi.encode(WITHDRAW_TYPEHASH, req))), sig);

        c.status = Status.Withdrawn;
        c.updatedAt = uint64(block.timestamp);

        bytes32 head = _advanceLedger(Action.Withdraw, req.principal, req.fiduciary, req.purposeId, 0);
        emit ConsentWithdrawn(req.principal, req.fiduciary, req.purposeId, head);
    }

    // --- processors ---

    function acknowledgeWithdrawal(address principal, address fiduciary, bytes32 purposeId) external {
        if (!processors[purposeId][msg.sender].registered) revert NotProcessor();
        Consent storage c = _consents[principal][_consentKey(fiduciary, purposeId)];
        if (c.status != Status.Withdrawn) revert NotWithdrawn();
        // One acknowledgement per withdrawal, not per consent for all time: after a re-grant and a second
        // withdrawal the processor must acknowledge again.
        if (_acknowledgedVersion[principal][purposeId][msg.sender] >= c.noticeVersion) revert AlreadyAcknowledged();
        _acknowledgedVersion[principal][purposeId][msg.sender] = c.noticeVersion;
        _advanceLedger(Action.Acknowledge, principal, fiduciary, purposeId, 0);
        emit WithdrawalAcknowledged(principal, purposeId, msg.sender, uint64(block.timestamp));
    }

    // --- views ---

    function isFiduciary(address fiduciary) external view returns (bool) {
        return fiduciaries[fiduciary].registered;
    }

    function isProcessor(bytes32 purposeId, address processor) external view returns (bool) {
        return processors[purposeId][processor].registered;
    }

    function getPurpose(bytes32 purposeId) external view returns (Purpose memory) {
        return _purposes[purposeId];
    }

    function getConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (Consent memory) {
        return _consents[principal][_consentKey(fiduciary, purposeId)];
    }

    /// @dev Expiry needs no transaction: it is just a comparison with the block time.
    function hasValidConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (bool) {
        Consent storage c = _consents[principal][_consentKey(fiduciary, purposeId)];
        return c.status == Status.Active && block.timestamp < c.expiresAt;
    }

    // --- internals ---

    function _consentKey(address fiduciary, bytes32 purposeId) private pure returns (bytes32) {
        return keccak256(abi.encode(fiduciary, purposeId));
    }

    function _requireOwnPurpose(bytes32 purposeId) private view {
        address owner = _purposes[purposeId].fiduciary;
        if (owner == address(0)) revert UnknownPurpose(purposeId);
        if (owner != msg.sender) revert WrongFiduciary();
    }

    /// @dev A reverted call undoes the increment, so a bad signature cannot burn someone's nonce.
    function _useNonce(address principal, uint256 nonce) private {
        uint256 expected = nonces[principal];
        if (nonce != expected) revert InvalidNonce(expected, nonce);
        nonces[principal] = expected + 1;
    }

    function _requireSigner(address principal, bytes32 digest, bytes calldata sig) private pure {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer != principal) revert InvalidSignature();
    }

    /// @dev ledgerHead = keccak256(abi.encode(ledgerHead, actionHash)) (drd.md §2), so a missing
    /// or reordered action changes every later head.
    function _advanceLedger(
        Action action,
        address principal,
        address fiduciary,
        bytes32 purposeId,
        uint64 expiresAtOrZero
    ) private returns (bytes32 head) {
        bytes32 actionHash =
            keccak256(abi.encode(uint8(action), principal, fiduciary, purposeId, expiresAtOrZero, uint64(block.timestamp)));
        head = keccak256(abi.encode(ledgerHead, actionHash));
        ledgerHead = head;
    }
}

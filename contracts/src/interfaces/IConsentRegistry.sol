// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Consent state shared by every company and the regulator (trd.md §3.1).
/// No personal data is ever stored here: addresses, hashes, purpose ids, status, expiry.
interface IConsentRegistry {
    enum Status { None, Active, Withdrawn }

    struct Consent {
        Status status;
        uint64 grantedAt;
        uint64 expiresAt;
        uint64 updatedAt;
        bytes32 noticeHash; // hash of the exact notice text the user saw
        uint32 noticeVersion;
    }

    struct Purpose {
        address fiduciary;
        bytes32 descHash; // hash of plain-language description
        uint32 retentionDays;
        bool sharesWithThirdParties;
        bool active;
    }

    // Field names and order are part of the spec and mirror shared/eip712.ts.
    struct GrantConsent {
        address principal;
        address fiduciary;
        bytes32 purposeId;
        uint64 expiresAt;
        bytes32 noticeHash;
        uint256 nonce;
        uint64 deadline;
    }

    struct WithdrawConsent {
        address principal;
        address fiduciary;
        bytes32 purposeId;
        uint256 nonce;
        uint64 deadline;
    }

    event FiduciaryRegistered(address indexed fiduciary, string name);
    event PurposeRegistered(address indexed fiduciary, bytes32 indexed purposeId, bytes32 descHash);
    event ProcessorRegistered(bytes32 indexed purposeId, address indexed processor);
    event ConsentGranted(
        address indexed principal,
        address indexed fiduciary,
        bytes32 indexed purposeId,
        uint64 expiresAt,
        bytes32 noticeHash,
        bytes32 ledgerHead
    );
    event ConsentWithdrawn(
        address indexed principal,
        address indexed fiduciary,
        bytes32 indexed purposeId,
        bytes32 ledgerHead
    );
    event WithdrawalAcknowledged(
        address indexed principal,
        bytes32 indexed purposeId,
        address indexed processor,
        uint64 at
    );

    // admin
    function registerFiduciary(address fiduciary, string calldata name, bytes32 metaHash) external;

    // fiduciary
    function registerPurpose(bytes32 purposeId, bytes32 descHash, uint32 retentionDays, bool shares) external;
    function registerProcessor(bytes32 purposeId, address processor, bytes32 metaHash) external;

    // anyone (relayer) carrying the principal's signature
    function grantConsent(GrantConsent calldata req, bytes calldata sig) external;
    function withdrawConsent(WithdrawConsent calldata req, bytes calldata sig) external;

    // registered processors
    function acknowledgeWithdrawal(address principal, address fiduciary, bytes32 purposeId) external;

    // views
    function hasValidConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (bool);
    function getConsent(address principal, address fiduciary, bytes32 purposeId) external view returns (Consent memory);
    function ledgerHead() external view returns (bytes32);
    function nonces(address principal) external view returns (uint256);
}

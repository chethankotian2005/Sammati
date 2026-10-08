// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConsentRegistry} from "./interfaces/IConsentRegistry.sol";

/// @dev Shell: every function reverts until the contract tests in trd.md §3.3 are written
/// and the implementation (OpenZeppelin EIP712 + ECDSA) lands.
contract ConsentRegistry is IConsentRegistry {
    error NotImplemented();

    function registerFiduciary(address, string calldata, bytes32) external pure {
        revert NotImplemented();
    }

    function registerPurpose(bytes32, bytes32, uint32, bool) external pure {
        revert NotImplemented();
    }

    function registerProcessor(bytes32, address, bytes32) external pure {
        revert NotImplemented();
    }

    function grantConsent(GrantConsent calldata, bytes calldata) external pure {
        revert NotImplemented();
    }

    function withdrawConsent(WithdrawConsent calldata, bytes calldata) external pure {
        revert NotImplemented();
    }

    function acknowledgeWithdrawal(address, address, bytes32) external pure {
        revert NotImplemented();
    }

    function hasValidConsent(address, address, bytes32) external pure returns (bool) {
        revert NotImplemented();
    }

    function getConsent(address, address, bytes32) external pure returns (Consent memory) {
        revert NotImplemented();
    }

    function ledgerHead() external pure returns (bytes32) {
        revert NotImplemented();
    }

    function nonces(address) external pure returns (uint256) {
        revert NotImplemented();
    }
}

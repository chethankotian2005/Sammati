// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessAnchor} from "./interfaces/IAccessAnchor.sol";

/// @dev Shell: reverts until the anchor tests in trd.md §3.3 (item 7) are written.
contract AccessAnchor is IAccessAnchor {
    error NotImplemented();

    function anchorAccessBatch(bytes32, uint64, uint64, uint32) external pure {
        revert NotImplemented();
    }

    function getBatch(address, uint256) external pure returns (bytes32, uint64, uint64, uint32, uint64) {
        revert NotImplemented();
    }

    function batchCount(address) external pure returns (uint256) {
        revert NotImplemented();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessAnchor} from "./interfaces/IAccessAnchor.sol";
import {IConsentRegistry} from "./interfaces/IConsentRegistry.sol";

/// @title AccessAnchor
/// @notice Each fiduciary periodically anchors the Merkle root of its hash-chained access log
/// (trd.md §3.2, §8). The log itself stays off chain; a regulator recomputes the roots from the
/// company's stored rows and compares them with these, so an edited or deleted row is detectable.
contract AccessAnchor is IAccessAnchor {
    struct Batch {
        bytes32 root;
        uint64 fromSeq;
        uint64 toSeq;
        uint32 count;
        uint64 at;
    }

    error ZeroAddress();
    error NotFiduciary();
    error InvalidRoot();
    error InvalidRange(uint64 fromSeq, uint64 toSeq, uint32 count);
    error NonContiguous(uint64 expectedFromSeq, uint64 fromSeq);
    error BatchNotFound(address fiduciary, uint256 index);

    /// @notice Who counts as a fiduciary is decided by the consent registry.
    IConsentRegistry public immutable registry;

    mapping(address fiduciary => Batch[]) private _batches;

    constructor(IConsentRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    /// @dev Batches must be contiguous (first starts at seq 1, each next one right after the
    /// previous toSeq). A gap in seq is a tamper signal (drd.md §7), so it is refused here rather
    /// than anchored and noticed later.
    function anchorAccessBatch(bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count) external {
        if (!registry.isFiduciary(msg.sender)) revert NotFiduciary();
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (toSeq < fromSeq || count != toSeq - fromSeq + 1) revert InvalidRange(fromSeq, toSeq, count);

        Batch[] storage batches = _batches[msg.sender];
        uint64 expectedFromSeq = batches.length == 0 ? 1 : batches[batches.length - 1].toSeq + 1;
        if (fromSeq != expectedFromSeq) revert NonContiguous(expectedFromSeq, fromSeq);

        batches.push(Batch({root: merkleRoot, fromSeq: fromSeq, toSeq: toSeq, count: count, at: uint64(block.timestamp)}));
        emit AccessBatchAnchored(msg.sender, batches.length - 1, merkleRoot, fromSeq, toSeq, count);
    }

    function getBatch(address fiduciary, uint256 index)
        external
        view
        returns (bytes32 root, uint64 fromSeq, uint64 toSeq, uint32 count, uint64 at)
    {
        Batch[] storage batches = _batches[fiduciary];
        if (index >= batches.length) revert BatchNotFound(fiduciary, index);
        Batch storage b = batches[index];
        return (b.root, b.fromSeq, b.toSeq, b.count, b.at);
    }

    function batchCount(address fiduciary) external view returns (uint256) {
        return _batches[fiduciary].length;
    }
}

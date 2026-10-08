// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Merkle roots of each company's access log, so tampering is detectable (trd.md §3.2).
interface IAccessAnchor {
    event AccessBatchAnchored(
        address indexed fiduciary,
        uint256 indexed index,
        bytes32 merkleRoot,
        uint64 fromSeq,
        uint64 toSeq,
        uint32 count
    );

    function anchorAccessBatch(bytes32 merkleRoot, uint64 fromSeq, uint64 toSeq, uint32 count) external; // onlyFiduciary

    function getBatch(address fiduciary, uint256 index)
        external
        view
        returns (bytes32 root, uint64 fromSeq, uint64 toSeq, uint32 count, uint64 at);

    function batchCount(address fiduciary) external view returns (uint256);
}

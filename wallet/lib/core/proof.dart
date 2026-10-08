// Proof models and Merkle verifier (drd.md §4.3, trd.md §6.1).
//
// W-07: the wallet fetches a proof from Core and verifies the Merkle path
// locally, so the user does not have to trust Core's word that the record
// is on chain.

import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:web3dart/crypto.dart' show keccak256; // web-safe: a hand-written 64-bit Keccak cannot compile to JavaScript

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

/// `GET /v1/proof/consent/:txHash` response (trd.md §6.1).
class ConsentProof {
  const ConsentProof({
    required this.txHash,
    required this.ledgerHead,
    required this.signer,
    required this.explorerUrl,
    required this.eventType,
    required this.fiduciary,
    required this.purposeId,
    required this.at,
  });

  // Core's ConsentProofResponse (shared/src/types.ts) names the signer `principal` (a consent is signed by the
  // data principal) and the kind `type`; `signer` / `eventType` are accepted too. explorerUrl is null on the
  // local chain, which has no explorer.
  factory ConsentProof.fromJson(Map<String, dynamic> json) => ConsentProof(
        txHash: json['txHash'] as String,
        ledgerHead: json['ledgerHead'] as String,
        signer: (json['signer'] ?? json['principal']) as String,
        explorerUrl: json['explorerUrl'] as String? ?? '',
        eventType: (json['eventType'] ?? json['type']) as String? ?? 'granted',
        fiduciary: json['fiduciary'] as String,
        purposeId: json['purposeId'] as String,
        at: json['at'] as int,
      );

  final String txHash;
  final String ledgerHead;

  /// The address that signed this consent action (the principal for grant/withdraw).
  final String signer;
  final String explorerUrl;
  final String eventType;
  final String fiduciary;
  final String purposeId;
  final int at;
}

/// `GET /v1/proof/access/:entryId` response (trd.md §6.1).
class AccessProof {
  const AccessProof({
    required this.entryId,
    required this.entryHash,
    required this.merkleProof,
    required this.merkleRoot,
    required this.anchorTxHash,
    required this.explorerUrl,
    required this.fiduciary,
    required this.purposeCode,
    required this.decision,
    required this.at,
  });

  // Core's AccessProofResponse (shared/src/types.ts) nests the log entry: { entry: { id, hash, fiduciary,
  // purposeCode, decision, at, ... }, merklePath, merkleRoot, batchIndex, anchorTxHash, explorerUrl }.
  // The flat form (entryId, entryHash, merkleProof, ...) is still accepted.
  factory AccessProof.fromJson(Map<String, dynamic> json) {
    final entry = json['entry'] is Map<String, dynamic> ? json['entry'] as Map<String, dynamic> : json;
    final proofList = (json['merklePath'] ?? json['merkleProof']) as List? ?? [];
    return AccessProof(
      entryId: (entry['id'] ?? entry['entryId']) as String,
      entryHash: (entry['hash'] ?? entry['entryHash']) as String,
      merkleProof: [for (final s in proofList) s as String],
      merkleRoot: json['merkleRoot'] as String,
      anchorTxHash: json['anchorTxHash'] as String,
      explorerUrl: json['explorerUrl'] as String? ?? '',
      fiduciary: entry['fiduciary'] as String,
      purposeCode: entry['purposeCode'] as String,
      decision: entry['decision'] as String,
      at: entry['at'] as int,
    );
  }

  final String entryId;
  final String entryHash;

  /// Sibling hashes from leaf to root (drd.md §4.3).
  final List<String> merkleProof;
  final String merkleRoot;
  final String anchorTxHash;
  final String explorerUrl;
  final String fiduciary;
  final String purposeCode;
  final String decision;
  final int at;
}

// ---------------------------------------------------------------------------
// Cascade acknowledgement row (trd.md §6.1 GET /cascade/:purposeId)
// ---------------------------------------------------------------------------

/// One processor row returned by `GET /v1/principals/:addr/cascade/:purposeId`.
class CascadeAckRow {
  const CascadeAckRow({
    required this.processor,
    required this.notifiedAt,
    this.processorName,
    this.ackedAt,
    this.txHash,
  });

  /// Returns null for rows that are missing required fields, so they are skipped
  /// rather than causing a crash (Core may add new fields in future).
  static CascadeAckRow? tryParse(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final processor = json['processor'];
    // notifiedAt is null for a processor that has not been told yet (nothing to show) and, after Core re-reads the
    // chain, for an acknowledgement it never saw the notification for: that one is shown as acknowledged.
    final notifiedAt = json['notifiedAt'] ?? json['ackedAt'];
    if (processor is! String || notifiedAt is! int) return null;
    final name = json['name'] ?? json['processorName'];
    return CascadeAckRow(
      processor: processor,
      notifiedAt: notifiedAt,
      processorName: name is String && name.isNotEmpty ? name : null,
      ackedAt: json['ackedAt'] as int?,
      txHash: json['txHash'] as String?,
    );
  }

  final String processor;

  /// The processor's display name (Core's `name`), e.g. AdPartnerQ. Null if Core did not send one.
  final String? processorName;

  /// Unix seconds when Core sent the withdrawal notification to this processor.
  final int notifiedAt;

  /// Unix seconds when the processor returned a signed acknowledgement. Null = still waiting.
  final int? ackedAt;

  /// On-chain tx hash of the acknowledgeWithdrawal call. Null until confirmed.
  final String? txHash;

  bool get acknowledged => ackedAt != null;
}

// ---------------------------------------------------------------------------
// Merkle verifier (drd.md §4.3)
//
// Algorithm (verbatim from spec):
//   Leaves = entry.hash
//   Parent = keccak256(min(a,b) || max(a,b))  — sorted, so order is canonical
//   Odd node is promoted unchanged
//   Proof = list of sibling hashes
// ---------------------------------------------------------------------------

class MerkleVerifier {
  /// Returns true iff applying `keccak256(min(a,b)||max(a,b))` up the [proof]
  /// sibling list from [leafHash] reaches [expectedRoot].
  ///
  /// Hex strings may include or omit the `0x` prefix.
  static bool verify({
    required String leafHash,
    required List<String> proof,
    required String expectedRoot,
  }) {
    var acc = _norm(leafHash);
    for (final sibling in proof) {
      acc = _hashPair(acc, _norm(sibling));
    }
    return acc == _norm(expectedRoot);
  }

  // `keccak256(min(a,b) || max(a,b))` — both inputs are already normalised.
  static String _hashPair(String a, String b) {
    final (lo, hi) = _less(a, b) ? (a, b) : (b, a);
    final loB = _fromHex(lo);
    final hiB = _fromHex(hi);
    final combined = Uint8List(loB.length + hiB.length)
      ..setRange(0, loB.length, loB)
      ..setRange(loB.length, loB.length + hiB.length, hiB);
    return hex.encode(keccak256(combined));
  }

  static bool _less(String a, String b) => a.compareTo(b) < 0;

  static String _norm(String h) {
    final s = (h.startsWith('0x') || h.startsWith('0X')) ? h.substring(2) : h;
    return s.toLowerCase();
  }

  static Uint8List _fromHex(String h) => Uint8List.fromList(hex.decode(h));
}

// ---------------------------------------------------------------------------

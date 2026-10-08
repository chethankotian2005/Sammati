// Proof models and Merkle verifier (drd.md §4.3, trd.md §6.1).
//
// W-07: the wallet fetches a proof from Core and verifies the Merkle path
// locally, so the user does not have to trust Core's word that the record
// is on chain.

import 'dart:typed_data';

import 'package:convert/convert.dart';

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

  factory ConsentProof.fromJson(Map<String, dynamic> json) => ConsentProof(
        txHash: json['txHash'] as String,
        ledgerHead: json['ledgerHead'] as String,
        signer: json['signer'] as String,
        explorerUrl: json['explorerUrl'] as String? ?? '',
        eventType: json['eventType'] as String? ?? 'granted',
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

  factory AccessProof.fromJson(Map<String, dynamic> json) {
    final proofList = json['merkleProof'] as List? ?? [];
    return AccessProof(
      entryId: json['entryId'] as String,
      entryHash: json['entryHash'] as String,
      merkleProof: [for (final s in proofList) s as String],
      merkleRoot: json['merkleRoot'] as String,
      anchorTxHash: json['anchorTxHash'] as String,
      explorerUrl: json['explorerUrl'] as String? ?? '',
      fiduciary: json['fiduciary'] as String,
      purposeCode: json['purposeCode'] as String,
      decision: json['decision'] as String,
      at: json['at'] as int,
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
    this.ackedAt,
    this.txHash,
  });

  /// Returns null for rows that are missing required fields, so they are skipped
  /// rather than causing a crash (Core may add new fields in future).
  static CascadeAckRow? tryParse(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final processor = json['processor'];
    final notifiedAt = json['notifiedAt'];
    if (processor is! String || notifiedAt is! int) return null;
    return CascadeAckRow(
      processor: processor,
      notifiedAt: notifiedAt,
      ackedAt: json['ackedAt'] as int?,
      txHash: json['txHash'] as String?,
    );
  }

  final String processor;

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
// Pure-Dart Keccak-256 compatible with Ethereum (NOT NIST SHA-3).
// Exposed at library level so tests and the verifier share one implementation.
// Based on the Keccak reference implementation by Markku-Juhani O. Saarinen.
// ---------------------------------------------------------------------------

Uint8List keccak256(Uint8List data) {
  final ctx = _Keccak256Ctx();
  ctx.absorb(data);
  return ctx.finalize();
}

class _Keccak256Ctx {
  static const _rate = 136; // bytes — 1088-bit rate for capacity 512
  final _state = List<int>.filled(25, 0);
  final _buf = Uint8List(_rate);
  int _pos = 0;

  void absorb(Uint8List data) {
    var i = 0;
    while (i < data.length) {
      final take = (_rate - _pos).clamp(0, data.length - i);
      for (var j = 0; j < take; j++) _buf[_pos + j] ^= data[i + j];
      _pos += take;
      i += take;
      if (_pos == _rate) {
        _xorInAndPermute();
        _pos = 0;
        _buf.fillRange(0, _rate, 0);
      }
    }
  }

  Uint8List finalize() {
    _buf[_pos] ^= 0x01; // Keccak domain separator (not SHA-3's 0x06)
    _buf[_rate - 1] ^= 0x80;
    _xorInAndPermute();
    final out = Uint8List(32);
    for (var i = 0; i < 32; i++) {
      out[i] = (_state[i ~/ 8] >> ((i % 8) * 8)) & 0xFF;
    }
    return out;
  }

  void _xorInAndPermute() {
    for (var i = 0; i < _rate; i++) {
      _state[i ~/ 8] ^= (_buf[i] & 0xFF) << ((i % 8) * 8);
    }
    _keccakF1600();
  }

  // Keccak-f[1600] — 24-round permutation over 25 64-bit words.
  static const _rc = <int>[
    0x0000000000000001, 0x0000000000008082,
    0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B,
    0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080,
    0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080,
    0x0000000080000001, 0x8000000080008008,
  ];
  static const _rotc = <int>[
    1, 3, 6, 10, 15, 21, 28, 36, 45, 55,
    2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
  ];
  static const _piln = <int>[
    10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
  ];

  void _keccakF1600() {
    final bc = List<int>.filled(5, 0);
    for (var r = 0; r < 24; r++) {
      // Theta
      for (var i = 0; i < 5; i++) {
        bc[i] = _state[i] ^ _state[i + 5] ^ _state[i + 10] ^ _state[i + 15] ^ _state[i + 20];
      }
      for (var i = 0; i < 5; i++) {
        final t = bc[(i + 4) % 5] ^ _rol64(bc[(i + 1) % 5], 1);
        for (var j = 0; j < 25; j += 5) _state[j + i] ^= t;
      }
      // Rho and Pi
      var t = _state[1];
      for (var i = 0; i < 24; i++) {
        final j = _piln[i];
        bc[0] = _state[j];
        _state[j] = _rol64(t, _rotc[i]);
        t = bc[0];
      }
      // Chi
      for (var j = 0; j < 25; j += 5) {
        for (var i = 0; i < 5; i++) bc[i] = _state[j + i];
        for (var i = 0; i < 5; i++) _state[j + i] ^= (~bc[(i + 1) % 5]) & bc[(i + 2) % 5];
      }
      // Iota
      _state[0] ^= _rc[r];
    }
  }

  // 64-bit rotate left using Dart's unsigned right-shift (>>>).
  static int _rol64(int x, int n) => (x << n) | (x >>> (64 - n));
}

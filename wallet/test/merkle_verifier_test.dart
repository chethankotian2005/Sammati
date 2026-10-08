import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/proof.dart';

void main() {
  group('MerkleVerifier', () {
    late Map<String, dynamic> vectors;

    setUpAll(() {
      final file = File('../shared/test-vectors/merkle.json');
      vectors = jsonDecode(file.readAsStringSync());
    });

    test('verifies correct proofs for all leaves in a 6-leaf tree', () {
      final leaves = (vectors['leaves'] as List).cast<String>();
      final expectedRoot = vectors['root'] as String;
      final proofs = (vectors['proofs'] as List).cast<List<dynamic>>();

      for (var i = 0; i < leaves.length; i++) {
        final leaf = leaves[i];
        final proof = proofs[i].cast<String>();

        final valid = MerkleVerifier.verify(
          leafHash: leaf,
          proof: proof,
          expectedRoot: expectedRoot,
        );
        expect(valid, isTrue, reason: 'Proof for leaf $i failed verification');
      }
    });

    test('rejects tampered leaf', () {
      final expectedRoot = vectors['root'] as String;
      final proof = (vectors['proofs'][0] as List).cast<String>();

      final valid = MerkleVerifier.verify(
        leafHash: '0x0000000000000000000000000000000000000000000000000000000000000bad',
        proof: proof,
        expectedRoot: expectedRoot,
      );
      expect(valid, isFalse);
    });

    test('rejects invalid root', () {
      final leaves = (vectors['leaves'] as List).cast<String>();
      final proof = (vectors['proofs'][0] as List).cast<String>();

      final valid = MerkleVerifier.verify(
        leafHash: leaves[0],
        proof: proof,
        expectedRoot: '0x0000000000000000000000000000000000000000000000000000000000000bad',
      );
      expect(valid, isFalse);
    });

    test('rejects empty proof if root != leaf', () {
      final leaves = (vectors['leaves'] as List).cast<String>();
      final expectedRoot = vectors['root'] as String;

      final valid = MerkleVerifier.verify(
        leafHash: leaves[0],
        proof: [],
        expectedRoot: expectedRoot,
      );
      expect(valid, isFalse);
    });

    test('accepts empty proof for 1-leaf tree', () {
      final leaf = '0x1234567890123456789012345678901234567890123456789012345678901234';
      final valid = MerkleVerifier.verify(
        leafHash: leaf,
        proof: [],
        expectedRoot: leaf,
      );
      expect(valid, isTrue);
    });
  });
}

// The vault envelope (trd.md §4.4) against the vectors the TypeScript side also passes
// (shared/test-vectors/envelope.json). If these pass, a phone's envelope opens in the Processor and the other
// way round.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/envelope.dart';

Uint8List _unhex(String value) => Uint8List.fromList(hex.decode(value.substring(2)));

void main() {
  final vectors = jsonDecode(File('../shared/test-vectors/envelope.json').readAsStringSync()) as Map<String, dynamic>;
  final processorPrivateKey = _unhex((vectors['processor'] as Map)['privateKey'] as String);
  final processorPublicKey = (vectors['processor'] as Map)['publicKey'] as String;

  EnvelopeContext ctxOf(Map<String, dynamic> v) =>
      EnvelopeContext(fiduciary: v['fiduciary'] as String, principal: v['principal'] as String, purposeCode: v['purposeCode'] as String);

  group('test vectors shared with the TypeScript side', () {
    for (final c in (vectors['cases'] as List).cast<Map<String, dynamic>>()) {
      final name = c['name'] as String;

      test('$name: sealing reproduces the envelope byte for byte', () async {
        final sealed = await sealEnvelope(
          c['payload'],
          processorPublicKey,
          ctxOf(c),
          ephemeralPrivateKey: _unhex(c['ephemeralPrivateKey'] as String),
          nonce: _unhex(c['nonce'] as String),
        );
        final expected = Envelope.fromJson((c['envelope'] as Map).cast<String, dynamic>());
        expect(sealed.toJson(), expected.toJson());
        expect('0x${hex.encode(envelopeAad(ctxOf(c)))}', c['aad']);
        expect(sealed.handle, c['handle']);
        expect(sealed.ciphertextHash, c['ciphertextHash']);
      });

      test('$name: opening with the Processor key gives the plaintext', () async {
        final envelope = Envelope.fromJson((c['envelope'] as Map).cast<String, dynamic>());
        final clear = await openEnvelope(envelope, processorPrivateKey, ctxOf(c));
        expect('0x${hex.encode(clear)}', c['plaintext']);
      });
    }

    for (final n in (vectors['negative'] as List).cast<Map<String, dynamic>>()) {
      test('fails to open: ${n['name']}', () async {
        final json = (n['envelope'] as Map).cast<String, dynamic>();
        // A wrong version or key length cannot even be built into an Envelope; both count as failing to open.
        expect(
          () async => openEnvelope(Envelope.fromJson(json), processorPrivateKey, ctxOf(n)),
          throwsA(isA<EnvelopeException>()),
        );
      });
    }
  });

  group('envelope', () {
    const ctx = EnvelopeContext(
      fiduciary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      purposeCode: 'credit_check',
    );
    const secret = {'pan': 'ABCDE1234F', 'incomeBand': '6-9 LPA', 'score': 742};

    test('a fresh ephemeral key and nonce every time, and the plaintext is nowhere in it', () async {
      final a = await sealEnvelope(secret, processorPublicKey, ctx);
      final b = await sealEnvelope(secret, processorPublicKey, ctx);
      expect(a.ephPub, isNot(b.ephPub));
      expect(a.ciphertext, isNot(b.ciphertext));
      expect(jsonEncode(a.toJson()), isNot(contains('ABCDE1234F')));
      final clear = utf8.decode(await openEnvelope(a, processorPrivateKey, ctx));
      expect(jsonDecode(clear), secret);
    });

    test('is bound to its customer, company and purpose', () async {
      final e = await sealEnvelope(secret, processorPublicKey, ctx);
      for (final other in [
        const EnvelopeContext(fiduciary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', purposeCode: 'marketing'),
        const EnvelopeContext(fiduciary: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', purposeCode: 'credit_check'),
        const EnvelopeContext(fiduciary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', principal: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', purposeCode: 'credit_check'),
      ]) {
        await expectLater(openEnvelope(e, processorPrivateKey, other), throwsA(isA<EnvelopeException>()));
      }
    });

    test('address case does not matter to the binding', () async {
      final e = await sealEnvelope(secret, processorPublicKey, ctx);
      final lower = EnvelopeContext(fiduciary: ctx.fiduciary.toLowerCase(), principal: ctx.principal.toLowerCase(), purposeCode: ctx.purposeCode);
      expect(await openEnvelope(e, processorPrivateKey, lower), isNotEmpty);
    });

    test('rejects a Processor key of the wrong size', () async {
      await expectLater(sealEnvelope(secret, '0x1234', ctx), throwsA(isA<EnvelopeException>()));
    });

    test('the submit message is the one the Processor verifies', () {
      expect(submitMessage('0xabc', 'req-1', 3), 'sammati-vault-submit:v2:0xabc:req-1:3');
    });
  });
}

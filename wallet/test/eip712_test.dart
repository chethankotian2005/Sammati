import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/eip712.dart';
import 'package:sammati/core/wallet_key.dart';

// Vectors come from shared/test-vectors/eip712.json (copied to the fixture
// path); regenerate there with shared/scripts/gen-eip712-vectors.ts.
void main() {
  final vectors = jsonDecode(File('test/fixtures/eip712.json').readAsStringSync()) as Map<String, dynamic>;
  final privateKey = vectors['privateKey'] as String;
  final signer = vectors['signer'] as String;
  final domainJson = vectors['domain'] as Map<String, dynamic>;
  final domain = Eip712Domain(
    chainId: domainJson['chainId'] as int,
    verifyingContract: domainJson['verifyingContract'] as String,
  );

  String recover(String digest, String signature) => SignatureUtil.ecRecover(
        signature: signature,
        message: Uint8List.fromList(hex.decode(digest.substring(2))),
        isPersonalSign: false,
      );

  GrantConsent grantFrom(Map<String, dynamic> m) => GrantConsent(
        principal: m['principal'] as String,
        fiduciary: m['fiduciary'] as String,
        purposeId: m['purposeId'] as String,
        expiresAt: m['expiresAt'] as int,
        noticeHash: m['noticeHash'] as String,
        nonce: m['nonce'] as String,
        deadline: m['deadline'] as int,
      );

  WithdrawConsent withdrawFrom(Map<String, dynamic> m) => WithdrawConsent(
        principal: m['principal'] as String,
        fiduciary: m['fiduciary'] as String,
        purposeId: m['purposeId'] as String,
        nonce: m['nonce'] as String,
        deadline: m['deadline'] as int,
      );

  test('fixture is an exact copy of shared/test-vectors/eip712.json', () {
    final shared = File('../shared/test-vectors/eip712.json');
    // Absent when the wallet is built outside the monorepo; the fixture is then all there is.
    if (!shared.existsSync()) return;
    expect(jsonDecode(shared.readAsStringSync()), vectors,
        reason: 'shared vectors changed: copy them to wallet/test/fixtures/eip712.json');
  });

  group('GrantConsent', () {
    final v = vectors['grant'] as Map<String, dynamic>;
    final message = (v['typedData'] as Map<String, dynamic>)['message'] as Map<String, dynamic>;
    final json = grantTypedDataJson(domain, grantFrom(message));

    test('digest matches shared vector', () => expect(eip712Digest(json), v['digest']));
    test('signature matches shared vector', () => expect(signTypedDataV4(privateKey, json), v['signature']));
    test('signature recovers to signer', () {
      expect(recover(v['digest'] as String, signTypedDataV4(privateKey, json)).toLowerCase(), signer.toLowerCase());
    });
  });

  group('WithdrawConsent', () {
    final v = vectors['withdraw'] as Map<String, dynamic>;
    final message = (v['typedData'] as Map<String, dynamic>)['message'] as Map<String, dynamic>;
    final json = withdrawTypedDataJson(domain, withdrawFrom(message));

    test('digest matches shared vector', () => expect(eip712Digest(json), v['digest']));
    test('signature matches shared vector', () => expect(signTypedDataV4(privateKey, json), v['signature']));
    test('signature recovers to signer', () {
      expect(recover(v['digest'] as String, signTypedDataV4(privateKey, json)).toLowerCase(), signer.toLowerCase());
    });
  });

  group('WalletKey', () {
    test('fromHex derives the vector signer address', () {
      expect(WalletKey.fromHex(privateKey).address, signer);
    });

    test('generate yields a usable 32-byte key whose signature recovers to its address', () {
      final key = WalletKey.generate();
      expect(key.privateKeyHex.length, 66);
      final msg = (vectors['withdraw'] as Map<String, dynamic>)['typedData']['message'] as Map<String, dynamic>;
      final json = withdrawTypedDataJson(domain, withdrawFrom({...msg, 'principal': key.address}));
      final recovered = recover(eip712Digest(json), signTypedDataV4(key.privateKeyHex, json));
      expect(recovered.toLowerCase(), key.address.toLowerCase());
    });

    test('generated keys are always exactly 32 bytes', () {
      // The sign-byte bug hit about half of random keys, so one sample proves little.
      for (var i = 0; i < 25; i++) {
        expect(WalletKey.generate().privateKeyHex, matches(RegExp(r'^0x[0-9a-f]{64}$')));
      }
    });

    test('two generated keys differ', () {
      expect(WalletKey.generate().privateKeyHex, isNot(WalletKey.generate().privateKeyHex));
    });
  });
}

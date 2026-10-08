import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/eip712.dart';
import 'package:sammati/core/wallet_service.dart';

import 'support/fakes.dart';

void main() {
  late FakeVault vault;
  late FakePresence presence;
  late WalletService service;

  const keyName = 'wallet_private_key';

  final vectors = jsonDecode(File('test/fixtures/eip712.json').readAsStringSync()) as Map<String, dynamic>;
  final domainJson = vectors['domain'] as Map<String, dynamic>;
  final domain = Eip712Domain(
    chainId: domainJson['chainId'] as int,
    verifyingContract: domainJson['verifyingContract'] as String,
  );

  String withdrawJson(String principal) => withdrawTypedDataJson(
        domain,
        WithdrawConsent(
          principal: principal,
          fiduciary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          purposeId: '0x707a80a4813eb36bdfb3f3aebdeea292384852e7f680fd128ea1009ac1192b29',
          nonce: '0',
          deadline: 1760007200,
        ),
      );

  Future<void> expectFailure(Future<Object?> call, WalletFailure failure) => expectLater(
        call,
        throwsA(isA<WalletException>().having((e) => e.failure, 'failure', failure)),
      );

  setUp(() {
    vault = FakeVault();
    presence = FakePresence();
    service = WalletService(vault: vault, presence: presence);
  });

  group('create', () {
    test('fresh install has no address', () async {
      expect(await service.address(), isNull);
    });

    test('stores a key and address after the user confirms', () async {
      final address = await service.create(reason: 'create');
      expect(presence.prompts, ['create']);
      expect(await service.address(), address);
      expect(vault.data[keyName], matches(RegExp(r'^0x[0-9a-f]{64}$')));
    });

    test('fails closed on a phone with no screen lock, storing nothing', () async {
      presence.available = false;
      await expectFailure(service.create(reason: 'create'), WalletFailure.noDeviceLock);
      expect(vault.data, isEmpty);
    });

    test('fails closed when the user does not confirm, storing nothing', () async {
      presence.approve = false;
      await expectFailure(service.create(reason: 'create'), WalletFailure.authFailed);
      expect(vault.data, isEmpty);
    });

    test('survives restart: a new service on the same storage sees the same wallet without a prompt', () async {
      final address = await service.create(reason: 'create');
      final restartedPresence = FakePresence();
      final restarted = WalletService(vault: vault, presence: restartedPresence);
      expect(await restarted.address(), address);
      expect(restartedPresence.prompts, isEmpty);
    });

    test('creating again never replaces the existing wallet', () async {
      final first = await service.create(reason: 'create');
      final keyBefore = vault.data[keyName];
      presence.prompts.clear();

      expect(await service.create(reason: 'create'), first);
      expect(vault.data[keyName], keyBefore);
      expect(presence.prompts, isEmpty);
    });

    test('reports a storage failure', () async {
      vault.failWrites = true;
      await expectFailure(service.create(reason: 'create'), WalletFailure.storageFailed);
    });
  });

  group('sign', () {
    test('requires a wallet', () async {
      await expectFailure(service.sign('{}', reason: 'sign'), WalletFailure.notCreated);
      expect(presence.prompts, isEmpty);
    });

    test('produces a signature that recovers to the wallet address', () async {
      final address = await service.create(reason: 'create');
      final json = withdrawJson(address);
      final signature = await service.sign(json, reason: 'sign');

      final recovered = SignatureUtil.ecRecover(
        signature: signature,
        message: Uint8List.fromList(hex.decode(eip712Digest(json).substring(2))),
        isPersonalSign: false,
      );
      expect(recovered.toLowerCase(), address.toLowerCase());
    });

    test('prompts on every signature, with the caller-supplied reason', () async {
      final address = await service.create(reason: 'create');
      presence.prompts.clear();

      await service.sign(withdrawJson(address), reason: 'first');
      await service.sign(withdrawJson(address), reason: 'second');
      expect(presence.prompts, ['first', 'second']);
    });

    test('is refused, and never reads the key, when the user does not confirm', () async {
      final address = await service.create(reason: 'create');
      vault.reads.clear();
      presence.approve = false;

      await expectFailure(service.sign(withdrawJson(address), reason: 'sign'), WalletFailure.authFailed);
      expect(vault.reads, isNot(contains(keyName)));
    });
  });
}

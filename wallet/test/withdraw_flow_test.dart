import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/wallet_service.dart';
import 'package:sammati/core/withdraw_flow.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';

void main() {
  final now = DateTime.fromMillisecondsSinceEpoch(1760000000 * 1000, isUtc: true);

  late FakePresence presence;
  late FakeCoreApi core;
  late WalletService wallet;
  late WithdrawFlow withdrawFlow;
  late ConsentFlow consentFlow;
  late String principal;

  setUp(() async {
    presence = FakePresence();
    core = FakeCoreApi();
    wallet = WalletService(vault: FakeVault(), presence: presence);
    principal = await wallet.create(reason: 'setup');
    presence.prompts.clear();
    withdrawFlow = WithdrawFlow(wallet: wallet, apiFor: (_) => core, clock: () => now);
    consentFlow = ConsentFlow(wallet: wallet, apiFor: (_) => core, clock: () => now);
  });

  Future<void> grantBoth() async {
    final shown = await consentFlow.loadNotice(testPayload());
    await consentFlow.grant(
      payload: testPayload(),
      shown: shown,
      choices: const [
        PurposeChoice(creditCheckId, ConsentExpiry.months6),
        PurposeChoice(marketingId, ConsentExpiry.months6),
      ],
      reason: 'sign',
    );
    presence.prompts.clear();
  }

  Future<WithdrawResult> withdraw(String purposeId) => withdrawFlow.withdraw(
        coreUrl: 'http://core.test:4000',
        fiduciary: fiduciaryAddress,
        purposeId: purposeId,
        reason: 'withdraw',
      );

  test('signs with the nonce the grants left behind, behind one prompt', () async {
    await grantBoth(); // consumed nonces 0 and 1
    final result = await withdraw(marketingId);

    expect(presence.prompts, ['withdraw']);
    expect(core.withdrawals.single['nonce'], '2');
    expect(core.withdrawals.single['principal'], principal);
    expect(core.withdrawals.single['purposeId'], marketingId);
    expect(result.purposeId, marketingId);
    expect(core.ledger[marketingId]!.status, 'Withdrawn');
    expect(core.ledger[creditCheckId]!.status, 'Active', reason: 'only the chosen purpose is withdrawn');
  });

  test('the signature verifies as the wallet\'s over the WithdrawConsent digest (the fake checks it like Core)', () async {
    await grantBoth();
    await withdraw(creditCheckId); // throws BAD_SIGNATURE if the signature is wrong
    expect(core.withdrawals, hasLength(1));
  });

  test('two withdrawals in a row use consecutive nonces', () async {
    await grantBoth();
    await withdraw(creditCheckId);
    await withdraw(marketingId);
    expect(core.withdrawals.map((w) => w['nonce']), ['2', '3']);
  });

  test('deadline is an hour out', () async {
    await grantBoth();
    await withdraw(creditCheckId);
    expect(core.withdrawals.single['deadline'], 1760000000 + 3600);
  });

  test('declining the biometric prompt posts nothing', () async {
    await grantBoth();
    presence.approve = false;
    await expectLater(withdraw(creditCheckId), throwsA(isA<WalletException>()));
    expect(core.withdrawals, isEmpty);
  });

  test('an already-withdrawn purpose has nothing to withdraw, and nothing is signed', () async {
    await grantBoth();
    await withdraw(creditCheckId);
    presence.prompts.clear();

    await expectLater(withdraw(creditCheckId), throwsA(isA<NothingToWithdrawException>()));
    expect(presence.prompts, isEmpty);
  });

  test('a purpose that was never granted has nothing to withdraw', () async {
    await expectLater(withdraw(kycId), throwsA(isA<NothingToWithdrawException>()));
  });

  test('an expired but still-active consent can be withdrawn', () async {
    core.seed(creditCheckId, expiresAt: 1760000000 - 86400);
    await withdraw(creditCheckId);
    expect(core.ledger[creditCheckId]!.status, 'Withdrawn');
  });

  test('Core being unreachable surfaces as a CoreException', () async {
    await grantBoth();
    core.consentsError = const CoreException(CoreFailure.unreachable);
    await expectLater(withdraw(creditCheckId), throwsA(isA<CoreException>()));
    expect(presence.prompts, isEmpty, reason: 'no prompt when it cannot even read the nonce');
  });

  test('a rejected withdrawal surfaces Core\'s code', () async {
    await grantBoth();
    core.withdrawError = const CoreException(CoreFailure.rejected, code: 'DEADLINE_PASSED');
    await expectLater(
      withdraw(creditCheckId),
      throwsA(isA<CoreException>().having((e) => e.code, 'code', 'DEADLINE_PASSED')),
    );
  });
}

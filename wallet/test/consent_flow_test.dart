import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/eip712.dart';
import 'package:sammati/core/wallet_service.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';

void main() {
  // 2025-10-09 08:53:20 UTC, so deadlines and expiries are exact.
  final now = DateTime.fromMillisecondsSinceEpoch(1760000000 * 1000, isUtc: true);

  late FakePresence presence;
  late FakeCoreApi core;
  late WalletService wallet;
  late ConsentFlow flow;
  late String principal;
  late List<String> requestedBaseUrls;

  setUp(() async {
    presence = FakePresence();
    core = FakeCoreApi();
    wallet = WalletService(vault: FakeVault(), presence: presence);
    principal = await wallet.create(reason: 'setup');
    presence.prompts.clear();
    requestedBaseUrls = [];
    flow = ConsentFlow(
      wallet: wallet,
      apiFor: (baseUrl) {
        requestedBaseUrls.add(baseUrl);
        return core;
      },
      clock: () => now,
    );
  });

  Future<void> expectRejected(Future<Object?> call) =>
      expectLater(call, throwsA(isA<NoticeRejectedException>()));

  group('loadNotice', () {
    test('returns a verified notice, fetched from the Core named in the QR code', () async {
      final notice = await flow.loadNotice(testPayload());
      expect(notice.hashMatches, isTrue);
      expect(requestedBaseUrls, ['http://core.test:4000']);
    });

    test('refuses a notice whose text does not match its hash', () async {
      final json = buildNoticeJson();
      (json['purposes'] as List).first['description']['en'] = 'Sell your data';
      core.notice = json;
      await expectRejected(flow.loadNotice(testPayload()));
    });

    test('refuses a notice for a different company than the QR code named', () async {
      final json = buildNoticeJson();
      json['fiduciary']['address'] = '0x0000000000000000000000000000000000000001';
      // Re-hash so only the QR/notice company mismatch can be the reason.
      core.notice = {...json, 'noticeHash': noticeHashOf(json)};
      await expectRejected(flow.loadNotice(testPayload()));
    });

    test('propagates Core errors', () async {
      core.noticeError = const CoreException(CoreFailure.unreachable);
      await expectLater(flow.loadNotice(testPayload()), throwsA(isA<CoreException>()));
    });
  });

  group('grant', () {
    Future<List<RecordedGrant>> grant(List<PurposeChoice> choices) async {
      final shown = await flow.loadNotice(testPayload());
      return flow.grant(payload: testPayload(), shown: shown, choices: choices, reason: 'sign');
    }

    test('signs one grant per purpose with consecutive nonces behind a single prompt', () async {
      core.notice = buildNoticeJson(nonce: '7');
      final recorded = await grant([
        const PurposeChoice(creditCheckId, ConsentExpiry.months6),
        const PurposeChoice(kycId, ConsentExpiry.year1),
      ]);

      expect(presence.prompts, ['sign'], reason: 'one biometric prompt for the whole action');
      expect(recorded.map((r) => r.purposeId), [creditCheckId, kycId]);
      expect(core.grants.map((g) => g['nonce']), ['7', '8']);
    });

    test('puts the right fields in each GrantConsent', () async {
      await grant([const PurposeChoice(creditCheckId, ConsentExpiry.days30)]);
      final request = core.grants.single;
      final notice = await flow.loadNotice(testPayload());

      expect(request['principal'], principal);
      expect(request['fiduciary'], fiduciaryAddress);
      expect(request['purposeId'], creditCheckId);
      expect(request['noticeHash'], notice.computeNoticeHash());
      expect(request['expiresAt'], 1760000000 + 30 * 86400);
      expect(request['deadline'], 1760000000 + 3600);
    });

    test('each expiry choice maps to its duration', () async {
      await grant([
        const PurposeChoice(creditCheckId, ConsentExpiry.days30),
        const PurposeChoice(marketingId, ConsentExpiry.months6),
        const PurposeChoice(kycId, ConsentExpiry.year1),
      ]);
      expect(core.grants.map((g) => (g['expiresAt']! as int) - 1760000000), [30 * 86400, 182 * 86400, 365 * 86400]);
    });

    test('signatures recover to the wallet address over the GrantConsent digest', () async {
      await grant([
        const PurposeChoice(creditCheckId, ConsentExpiry.months6),
        const PurposeChoice(marketingId, ConsentExpiry.months6),
      ]);
      final domain = Eip712Domain(chainId: 31337, verifyingContract: verifyingContract);

      for (final (i, request) in core.grants.indexed) {
        final message = GrantConsent(
          principal: request['principal']! as String,
          fiduciary: request['fiduciary']! as String,
          purposeId: request['purposeId']! as String,
          expiresAt: request['expiresAt']! as int,
          noticeHash: request['noticeHash']! as String,
          nonce: request['nonce']! as String,
          deadline: request['deadline']! as int,
        );
        final digest = eip712Digest(grantTypedDataJson(domain, message));
        expect(recoverSigner(digest, core.signatures[i]).toLowerCase(), principal.toLowerCase());
      }
    });

    test('does nothing for an empty selection', () async {
      expect(await grant([]), isEmpty);
      expect(presence.prompts, isEmpty);
      expect(core.grants, isEmpty);
    });

    test('signs nothing when the user declines the biometric prompt', () async {
      presence.approve = false;
      await expectLater(
        grant([const PurposeChoice(creditCheckId, ConsentExpiry.months6)]),
        throwsA(isA<WalletException>()),
      );
      expect(core.grants, isEmpty);
    });

    test('refuses to sign if the notice changed after the user saw it', () async {
      final shown = await flow.loadNotice(testPayload());
      final changed = buildNoticeJson();
      (changed['purposes'] as List).first['description']['en'] = 'Something else entirely';
      changed['noticeHash'] = noticeHashOf(changed);
      core.notice = changed;

      await expectRejected(flow.grant(
        payload: testPayload(),
        shown: shown,
        choices: const [PurposeChoice(creditCheckId, ConsentExpiry.months6)],
        reason: 'sign',
      ));
      expect(core.grants, isEmpty);
      expect(presence.prompts, isEmpty, reason: 'the user is not even asked to approve');
    });

    test('rejects a purpose that is not in the notice', () async {
      await expectRejected(grant([
        const PurposeChoice('0x4444444444444444444444444444444444444444444444444444444444444444', ConsentExpiry.months6),
      ]));
    });

    test('reports what was already recorded when posting stops partway', () async {
      core.failGrantAt = 1;
      final shown = await flow.loadNotice(testPayload());
      final attempt = flow.grant(
        payload: testPayload(),
        shown: shown,
        choices: const [
          PurposeChoice(creditCheckId, ConsentExpiry.months6),
          PurposeChoice(marketingId, ConsentExpiry.months6),
        ],
        reason: 'sign',
      );

      await expectLater(
        attempt,
        throwsA(isA<GrantInterruptedException>().having((e) => e.recorded.map((r) => r.purposeId), 'recorded', [creditCheckId])),
      );
    });

    test('a retry re-fetches the nonce and grants only what is left, with a valid nonce', () async {
      core.failGrantAt = 1;
      final shown = await flow.loadNotice(testPayload());
      try {
        await flow.grant(
          payload: testPayload(),
          shown: shown,
          choices: const [
            PurposeChoice(creditCheckId, ConsentExpiry.months6),
            PurposeChoice(marketingId, ConsentExpiry.months6),
          ],
          reason: 'sign',
        );
      } on GrantInterruptedException {
        // expected
      }

      core.failGrantAt = -1;
      final retried = await flow.grant(
        payload: testPayload(),
        shown: shown,
        choices: const [PurposeChoice(marketingId, ConsentExpiry.months6)],
        reason: 'sign',
      );

      expect(retried.map((r) => r.purposeId), [marketingId]);
      // Nonce 0 was used by the first purpose, so the retry must sign nonce 1.
      expect(core.grants.map((g) => g['nonce']), ['0', '1']);
      expect(core.grants.map((g) => g['purposeId']), [creditCheckId, marketingId]);
    });
  });
}

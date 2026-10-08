// Runs the real wallet consent flow against a running Core (stub or live).
// Skipped unless CORE_URL is set, so `flutter test` stays offline:
//
//   pnpm --filter @sammati/core dev        # in another terminal
//   flutter test test/integration --dart-define=CORE_URL=http://127.0.0.1:4000

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/activity.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/withdraw_flow.dart';
import 'package:sammati/core/wallet_service.dart';

import '../support/fake_core.dart' show fiduciaryAddress;
import '../support/fakes.dart';

const _coreUrl = String.fromEnvironment('CORE_URL');

Future<Map<String, dynamic>> _json(String method, String path, [Object? body]) async {
  final client = HttpClient();
  try {
    final request = await client.openUrl(method, Uri.parse('$_coreUrl$path'));
    request.headers.contentType = ContentType.json;
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    expect(response.statusCode, lessThan(300), reason: '$method $path -> $text');
    return jsonDecode(text) as Map<String, dynamic>;
  } finally {
    client.close();
  }
}

void main() {
  final enabled = _coreUrl.isNotEmpty;

  test('scan -> notice -> grant records consent on Core', () async {
    // What the console does when the operator clicks "New consent request".
    final created = await _json('POST', '/v1/fiduciaries/$fiduciaryAddress/requests', {
      'purposes': ['credit_check', 'marketing'],
      'customerAlias': 'Asha',
    });
    final payload = QrPayload.tryParse(created['qrPayload'])!;

    // A fresh wallet, exactly as onboarding creates it.
    final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
    final principal = await wallet.create(reason: 'setup');
    final flow = ConsentFlow(wallet: wallet, apiFor: DioCoreApi.new);

    final notice = await flow.loadNotice(payload);
    expect(notice.hashMatches, isTrue, reason: 'Dart canonical JSON + keccak must equal Core\'s noticeHash');
    expect(notice.purposes.map((p) => p.code), ['credit_check', 'marketing']);

    final recorded = await flow.grant(
      payload: payload,
      shown: notice,
      choices: [for (final p in notice.purposes) PurposeChoice(p.id, ConsentExpiry.months6)],
      reason: 'sign',
    );
    expect(recorded, hasLength(2));
    expect(recorded.every((r) => RegExp(r'^0x[0-9a-f]{64}$').hasMatch(r.txHash)), isTrue);

    // Core now reports both purposes as active for this wallet.
    final consents = await _json('GET', '/v1/principals/$principal/consents');
    final text = jsonEncode(consents);
    expect(text, contains('"Active"'));
    for (final r in recorded) {
      expect(text.toLowerCase(), contains(r.purposeId.toLowerCase()));
    }

    // Two grants consumed nonces 0 and 1, so the next notice for this wallet starts at 2.
    expect((await flow.loadNotice(payload)).nonce, '2');
  }, skip: enabled ? false : 'set CORE_URL to run against a Core');

  test('golden path: grant -> ALLOWED -> withdraw (live event) -> BLOCKED', () async {
    final created = await _json('POST', '/v1/fiduciaries/$fiduciaryAddress/requests', {
      'purposes': ['marketing'],
      'customerAlias': 'Asha',
    });
    final payload = QrPayload.tryParse(created['qrPayload'])!;

    final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
    final principal = await wallet.create(reason: 'setup');
    final consentFlow = ConsentFlow(wallet: wallet, apiFor: DioCoreApi.new);
    final withdrawFlow = WithdrawFlow(wallet: wallet, apiFor: DioCoreApi.new);

    final notice = await consentFlow.loadNotice(payload);
    final purposeId = notice.purposes.single.id;
    await consentFlow.grant(
      payload: payload,
      shown: notice,
      choices: [PurposeChoice(purposeId, ConsentExpiry.months6)],
      reason: 'sign',
    );

    // The home screen's view: nonce and domain come with the consents.
    final api = DioCoreApi(_coreUrl);
    final before = await api.getConsents(principal);
    expect(before.nonce, '1');
    expect(before.domain.chainId, notice.domain.chainId);
    expect(before.consent(fiduciaryAddress, purposeId)!.status, ConsentStatus.active);

    Future<String> fire() async {
      final r = await _json('POST', '/v1/demo/fire', {
        'fiduciary': fiduciaryAddress,
        'purposeCode': 'marketing',
        'principal': principal,
      });
      return r['decision'] as String;
    }

    expect(await fire(), 'ALLOWED');

    // Listen the way the home screen does, then withdraw.
    final live = WsLiveEvents(_coreUrl, principal);
    addTearDown(live.dispose);
    final connected = live.connection.firstWhere((up) => up).timeout(const Duration(seconds: 5));
    await connected;
    await Future<void>.delayed(const Duration(milliseconds: 300)); // let the subscription land
    final liveUpdate = live.consentUpdates.first.timeout(const Duration(seconds: 5));

    final result = await withdrawFlow.withdraw(
      coreUrl: _coreUrl,
      fiduciary: fiduciaryAddress,
      purposeId: purposeId,
      reason: 'withdraw',
    );

    final event = await liveUpdate;
    expect(event.status, ConsentStatus.withdrawn);
    expect(event.purposeId.toLowerCase(), purposeId.toLowerCase());
    expect(event.txHash, result.txHash);

    final after = await api.getConsents(principal);
    expect(after.consent(fiduciaryAddress, purposeId)!.status, ConsentStatus.withdrawn);
    expect(after.nonce, '2');
    expect(await fire(), 'BLOCKED');
  }, skip: enabled ? false : 'set CORE_URL to run against a Core');

  test('W-06: a company request reaches the feed over the socket in under 2 s, and is in /activity', () async {
    final created = await _json('POST', '/v1/fiduciaries/$fiduciaryAddress/requests', {
      'purposes': ['credit_check'],
      'customerAlias': 'Asha',
    });
    final payload = QrPayload.tryParse(created['qrPayload'])!;
    final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
    final principal = await wallet.create(reason: 'setup');
    final consentFlow = ConsentFlow(wallet: wallet, apiFor: DioCoreApi.new);
    final notice = await consentFlow.loadNotice(payload);
    await consentFlow.grant(
      payload: payload,
      shown: notice,
      choices: [PurposeChoice(notice.purposes.single.id, ConsentExpiry.months6)],
      reason: 'sign',
    );

    final live = WsLiveEvents(_coreUrl, principal);
    addTearDown(live.dispose);
    await live.connection.firstWhere((up) => up).timeout(const Duration(seconds: 5));
    await Future<void>.delayed(const Duration(milliseconds: 300)); // let the subscription land
    final arrival = live.accessEvents.first.timeout(const Duration(seconds: 2));

    // What the console simulator does: a company reads this customer's data.
    final stopwatch = Stopwatch()..start();
    await _json('POST', '/v1/demo/fire', {
      'fiduciary': fiduciaryAddress,
      'purposeCode': 'credit_check',
      'principal': principal,
    });
    final row = await arrival; // throws if it takes longer than 2 s
    stopwatch.stop();

    expect(stopwatch.elapsed, lessThan(const Duration(seconds: 2)), reason: 'prd.md W-06');
    expect(row.decision, Decision.allowed);
    expect(row.purposeCode, 'credit_check');
    expect(row.fiduciaryName, isNotEmpty);

    // The same row is in the feed endpoint, newest first, so a reconnect can catch up.
    final feed = await DioCoreApi(_coreUrl).getActivity(principal);
    expect(feed.first.id, row.id);
    expect(feed.first.decision, Decision.allowed);
  }, skip: enabled ? false : 'set CORE_URL to run against a Core');
}

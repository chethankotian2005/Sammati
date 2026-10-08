// Runs the real wallet consent flow against a running Core (stub or live).
// Skipped unless CORE_URL is set, so `flutter test` stays offline:
//
//   pnpm --filter @sammati/core dev        # in another terminal
//   flutter test test/integration --dart-define=CORE_URL=http://127.0.0.1:4000

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/core_api.dart';
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
}

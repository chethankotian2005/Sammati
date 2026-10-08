// V-01 to V-04 from the phone's side, against a running REAL stack (`pnpm demo:up`: Core, the Processor, QuickLoan).
// The wallet's own Dart code seals the demo profile, signs the submission and sends it; the Node Processor opens
// it. If the Dart and TypeScript envelopes ever disagree, this is the test that says so. Skipped unless CORE_URL is set:
//
//   flutter test test/integration/real_processor_test.dart --dart-define=CORE_URL=http://127.0.0.1:4000

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/demo_profile.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/processor_api.dart';
import 'package:sammati/core/vault_flow.dart';
import 'package:sammati/core/wallet_service.dart';
import 'package:sammati/core/withdraw_flow.dart';

import '../support/fake_core.dart' show fiduciaryAddress;
import '../support/fakes.dart';

const _coreUrl = String.fromEnvironment('CORE_URL');
const _apiKey = 'sk_demo_quickloan'; // QuickLoan's demo key (trd.md §10)

Future<({int status, Map<String, dynamic> json})> _http(String method, String url, {Object? body, Map<String, String> headers = const {}}) async {
  final client = HttpClient();
  try {
    final request = await client.openUrl(method, Uri.parse(url));
    request.headers.contentType = ContentType.json;
    headers.forEach(request.headers.set);
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    return (status: response.statusCode, json: text.isEmpty ? <String, dynamic>{} : jsonDecode(text) as Map<String, dynamic>);
  } finally {
    client.close();
  }
}

/// A fresh wallet that has given QuickLoan consent for credit_check, as scan + consent would leave it.
Future<({WalletService wallet, String principal})> _consented() async {
  final created = await _http('POST', '$_coreUrl/v1/fiduciaries/$fiduciaryAddress/requests', body: {
    'purposes': ['credit_check'],
    'customerAlias': 'Asha',
  });
  final payload = QrPayload.tryParse(created.json['qrPayload'])!;
  final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
  final principal = await wallet.create(reason: 'setup');
  final flow = ConsentFlow(wallet: wallet, apiFor: DioCoreApi.new);
  final notice = await flow.loadNotice(payload);
  await flow.grant(
    payload: payload,
    shown: notice,
    choices: [for (final p in notice.purposes) PurposeChoice(p.id, ConsentExpiry.months6)],
    reason: 'sign',
  );
  return (wallet: wallet, principal: principal);
}

void main() {
  final skip = _coreUrl.isEmpty ? 'set CORE_URL to run against a stack' : false;

  late String processorUrl;
  late VaultFlow flow;

  setUp(() async {
    if (_coreUrl.isEmpty) return;
    processorUrl = await DioCoreApi(_coreUrl).getProcessorUrl();
  });

  Future<({int status, Map<String, dynamic> json})> evaluate(String handle) => _http('POST', '$processorUrl/v1/processor/evaluate',
      headers: {'x-sammati-api-key': _apiKey},
      body: {'handle': handle, 'fiduciary': fiduciaryAddress, 'purposeCode': 'credit_check', 'action': 'loan_decision'});

  test('Core points at a Processor that calls itself a simulated enclave', () async {
    final key = await DioProcessorApi(processorUrl).getPublicKey();
    expect(key.publicKey, matches(RegExp(r'^0x[0-9a-f]{64}$')));
    expect(key.mode, 'simulated-enclave');
  }, skip: skip);

  test('the wallet seals the demo profile, the Processor decides, and a withdrawal erases the data', () async {
    final who = await _consented();
    flow = VaultFlow(wallet: who.wallet, coreFor: DioCoreApi.new, processorFor: DioProcessorApi.new);

    final live = WsLiveEvents(_coreUrl, who.principal);
    addTearDown(live.dispose);
    final notices = <VaultNotice>[];
    final sub = live.vaultUpdates.listen(notices.add);
    addTearDown(sub.cancel);
    await live.connection.firstWhere((up) => up).timeout(const Duration(seconds: 5));

    // 1. send securely: Dart seals, signs (EIP-191), the Processor verifies and stores
    final sent = await flow.send(coreUrl: _coreUrl, fiduciary: fiduciaryAddress, purposeCode: 'credit_check', reason: 'confirm');
    expect(sent.handle, matches(RegExp(r'^0x[0-9a-f]{64}$')));

    // 2. the vault holds ciphertext and metadata, whoever asks
    final vaulted = await _http('GET', '$processorUrl/v1/vault/${sent.handle}');
    expect(vaulted.status, 200);
    expect(vaulted.json['status'], 'stored');
    expect(vaulted.json['ciphertextHash'], sent.ciphertextHash);
    expect(jsonEncode(vaulted.json), isNot(contains(DemoProfile.pan)));
    final stored = Envelope.fromJson((vaulted.json['envelope'] as Map).cast<String, dynamic>());
    expect(stored.handle, sent.handle, reason: 'the handle is the hash of exactly what the phone sent');

    // 3. the Processor opens what Dart sealed and decides
    final decision = await evaluate(sent.handle);
    expect(decision.status, 200, reason: '${decision.json}');
    expect(decision.json['decision'], 'approved');
    expect(decision.json['limit'], 300000);
    expect(decision.json['reasonCodes'], ['SCORE_FAIR']);
    expect(jsonEncode(decision.json), isNot(contains(DemoProfile.pan)));

    // 4. the live socket told the phone
    await _until(() => notices.any((n) => n.kind == VaultNoticeKind.stored), 'the vault.stored event');
    expect(notices.firstWhere((n) => n.kind == VaultNoticeKind.stored).handle, sent.handle);

    // 5. withdraw: the next ask is refused with the reason, and the ciphertext is gone
    final consents = await DioCoreApi(_coreUrl).getConsents(who.principal);
    final credit = consents.companies.single.consents.single;
    await WithdrawFlow(wallet: who.wallet, apiFor: DioCoreApi.new)
        .withdraw(coreUrl: _coreUrl, fiduciary: fiduciaryAddress, purposeId: credit.purposeId, reason: 'withdraw');
    final refused = await evaluate(sent.handle);
    expect(refused.status, 451);
    expect(refused.json['code'], 'CONSENT_WITHDRAWN');

    final erased = await _until(() async {
      final v = await _http('GET', '$processorUrl/v1/vault/${sent.handle}');
      return v.json['status'] == 'erased' ? v.json : null;
    }, 'the vault entry to be erased');
    expect(erased['envelope'], isNull);
    await _until(() => notices.any((n) => n.kind == VaultNoticeKind.erased), 'the vault.erased event');
  }, skip: skip);

  test('a Processor that is asked to store data without consent refuses, and the wallet says so', () async {
    final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
    await wallet.create(reason: 'setup');
    flow = VaultFlow(wallet: wallet, coreFor: DioCoreApi.new, processorFor: DioProcessorApi.new);
    await expectLater(
      flow.send(coreUrl: _coreUrl, fiduciary: fiduciaryAddress, purposeCode: 'credit_check', reason: 'confirm'),
      throwsA(isA<VaultRefusedException>().having((e) => e.code, 'code', 'NO_CONSENT')),
    );
  }, skip: skip);

  test('a tampered ciphertext is an error, never a guessed decision', () async {
    final who = await _consented();
    flow = VaultFlow(wallet: who.wallet, coreFor: DioCoreApi.new, processorFor: DioProcessorApi.new);
    final sent = await flow.send(coreUrl: _coreUrl, fiduciary: fiduciaryAddress, purposeCode: 'credit_check', reason: 'confirm');

    expect((await _http('POST', '$processorUrl/v1/demo/tamper/${sent.handle}')).status, 200);
    final result = await evaluate(sent.handle);
    expect(result.status, 422);
    expect((result.json['error'] as Map)['code'], 'CIPHERTEXT_INVALID');
    expect(result.json.containsKey('decision'), isFalse);
  }, skip: skip);
}

Future<T> _until<T>(FutureOr<T?> Function() read, String what, {Duration timeout = const Duration(seconds: 6)}) async {
  final deadline = DateTime.now().add(timeout);
  while (true) {
    final value = await read();
    if (value != null && value != false) return value as T;
    if (DateTime.now().isAfter(deadline)) fail('timed out waiting for $what');
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}

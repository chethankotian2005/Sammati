// W-07 (proofs), W-08 (cascade) and W-10 (data rights), run with the wallet's own client, models, Merkle
// verifier and rights controller against a running REAL Core (`pnpm demo:up`). Skipped unless CORE_URL is set:
//
//   flutter test test/integration/real_core_w07_w08_w10_test.dart --dart-define=CORE_URL=http://127.0.0.1:4000
//
// Each test states what the wallet needs from Core; a failure here is a wallet/Core contract mismatch.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sammati/core/consent_flow.dart';
import 'package:sammati/core/consent_providers.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/notice.dart';
import 'package:sammati/core/preferences.dart';
import 'package:sammati/core/proof.dart';
import 'package:sammati/core/rights_controller.dart';
import 'package:sammati/core/wallet_providers.dart';
import 'package:sammati/core/wallet_service.dart';
import 'package:sammati/core/withdraw_flow.dart';

import '../support/fake_core.dart' show fiduciaryAddress;
import '../support/fakes.dart';

const _coreUrl = String.fromEnvironment('CORE_URL');
const _mediCare = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

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

/// A fresh wallet that has consented to [purposes] at QuickLoan, as onboarding + scan + consent would leave it.
Future<({WalletService wallet, String principal, QrPayload payload, ConsentNotice notice, List<RecordedGrant> grants})> _consented(
  List<String> purposes,
) async {
  final created = await _json('POST', '/v1/fiduciaries/$fiduciaryAddress/requests', {'purposes': purposes, 'customerAlias': 'Asha'});
  final payload = QrPayload.tryParse(created['qrPayload'])!;
  final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
  final principal = await wallet.create(reason: 'setup');
  final flow = ConsentFlow(wallet: wallet, apiFor: DioCoreApi.new);
  final notice = await flow.loadNotice(payload);
  final grants = await flow.grant(
    payload: payload,
    shown: notice,
    choices: [for (final p in notice.purposes) PurposeChoice(p.id, ConsentExpiry.months6)],
    reason: 'sign',
  );
  return (wallet: wallet, principal: principal, payload: payload, notice: notice, grants: grants);
}

void main() {
  final skip = _coreUrl.isEmpty ? 'set CORE_URL to run against a Core' : false;

  group('W-10 data rights', () {
    test('a request filed through the wallet client is stored and listed with the company name', () async {
      final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
      final principal = await wallet.create(reason: 'setup');
      final api = DioCoreApi(_coreUrl);

      expect(await api.getRights(principal), isEmpty);

      await api.submitRightsRequest(principal, fiduciaryAddress, 'erasure', 'Please delete my marketing data');
      await api.submitRightsRequest(principal, _mediCare, 'access', '');

      final rows = await api.getRights(principal);
      expect(rows.map((r) => [r.fiduciaryName, r.type, r.status, r.note]), [
        ['QuickLoan', 'erasure', 'open', 'Please delete my marketing data'],
        ['MediCare+', 'access', 'open', ''],
      ]);
      expect(rows.first.principal.toLowerCase(), principal.toLowerCase());
      expect(rows.first.createdAt, greaterThan(1700000000));
      expect(rows.every((r) => r.id.startsWith('rights_')), isTrue);
    }, skip: skip);

    test('the wallet\'s rights controller (what the Rights screen reads) loads, submits and refreshes against Core', () async {
      SharedPreferences.setMockInitialValues({});
      final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
      final principal = await wallet.create(reason: 'setup');
      final container = ProviderContainer(overrides: [
        sharedPreferencesProvider.overrideWithValue(await SharedPreferences.getInstance()),
        walletServiceProvider.overrideWithValue(wallet),
        coreUrlProvider.overrideWith(() => _FixedCoreUrl()),
      ]);
      addTearDown(container.dispose);
      await container.read(walletAddressProvider.future);

      final sub = container.listen(rightsProvider, (_, _) {});
      addTearDown(sub.close);
      Future<RightsState> settled() async {
        for (var i = 0; i < 100; i++) {
          final s = container.read(rightsProvider);
          if (!s.isLoading) return s;
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
        fail('rights list never finished loading');
      }

      expect((await settled()).requests, isEmpty);
      expect(container.read(rightsProvider).error, isFalse);

      await container.read(rightsProvider.notifier).submit(fiduciaryAddress, 'grievance', 'Marketing SMS after I withdrew');
      final state = container.read(rightsProvider);
      expect(state.error, isFalse);
      expect(state.requests.map((r) => [r.fiduciaryName, r.type, r.status]), [
        ['QuickLoan', 'grievance', 'open'],
      ]);

      // and it really is on Core, not just in the controller
      final onCore = await _json('GET', '/v1/principals/$principal/rights');
      expect((onCore['rights'] as List).single['note'], 'Marketing SMS after I withdrew');
    }, skip: skip);

    test('a request for a company that does not exist is refused, and nothing is stored', () async {
      final wallet = WalletService(vault: FakeVault(), presence: FakePresence());
      final principal = await wallet.create(reason: 'setup');
      final api = DioCoreApi(_coreUrl);
      await expectLater(
        api.submitRightsRequest(principal, '0x000000000000000000000000000000000000dEaD', 'access', ''),
        throwsA(isA<CoreException>()),
      );
      expect(await api.getRights(principal), isEmpty);
    }, skip: skip);
  });

  group('W-08 cascade', () {
    test('after a withdrawal the wallet sees the processor told, then acknowledged, over the socket and in the list', () async {
      final c = await _consented(['marketing']);
      final purposeId = c.notice.purposes.single.id;
      final api = DioCoreApi(_coreUrl);

      // before any withdrawal there is nothing to show
      expect(await api.getCascadeAcks(c.principal, purposeId), isEmpty);

      final live = WsLiveEvents(_coreUrl, c.principal);
      addTearDown(live.dispose);
      await live.connection.firstWhere((up) => up).timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final updates = <CascadeAck>[];
      final sub = live.cascadeUpdates.listen(updates.add);
      addTearDown(sub.cancel);

      await WithdrawFlow(wallet: c.wallet, apiFor: DioCoreApi.new).withdraw(
        coreUrl: _coreUrl,
        fiduciary: fiduciaryAddress,
        purposeId: purposeId,
        reason: 'withdraw',
      );

      // the list endpoint, polled like the pass screen does
      CascadeAckRow? acked;
      for (var i = 0; i < 80 && acked == null; i++) {
        final rows = await api.getCascadeAcks(c.principal, purposeId);
        acked = rows.where((r) => r.ackedAt != null).firstOrNull;
        if (acked == null) await Future<void>.delayed(const Duration(milliseconds: 150));
      }
      expect(acked, isNotNull, reason: 'AdPartnerQ should acknowledge within 1 to 3 s');
      expect(acked!.txHash, matches(RegExp(r'^0x[0-9a-f]{64}$')));
      expect(acked.processor.toLowerCase(), '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc');

      // the socket delivered told-then-acknowledged
      expect(updates.map((u) => u.ackedAt != null), [false, true]);
      expect(updates.first.processor.toLowerCase(), acked.processor.toLowerCase());
    }, skip: skip, timeout: const Timeout(Duration(seconds: 30)));

    test('the processor\'s NAME reaches the wallet (ui.md: "Also told: AdPartnerQ ✓ 2 s ago")', () async {
      final c = await _consented(['marketing']);
      final purposeId = c.notice.purposes.single.id;
      await WithdrawFlow(wallet: c.wallet, apiFor: DioCoreApi.new).withdraw(
        coreUrl: _coreUrl,
        fiduciary: fiduciaryAddress,
        purposeId: purposeId,
        reason: 'withdraw',
      );
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final raw = await _json('GET', '/v1/principals/${c.principal}/cascade/$purposeId');
      final name = ((raw['processors'] as List).first as Map)['name'];
      expect(name, 'AdPartnerQ'); // Core sends it...

      final row = (await DioCoreApi(_coreUrl).getCascadeAcks(c.principal, purposeId)).first;
      expect(row.toString(), isNot(isEmpty));
      // ...and the wallet's row keeps it, so the screen can show a name rather than an address
      expect(_hasProcessorName(row), isTrue, reason: 'CascadeAckRow drops the name Core sends');
    }, skip: skip, timeout: const Timeout(Duration(seconds: 30)));
  });

  group('W-07 proofs', () {
    test('a consent receipt from the grant transaction parses and shows the on-chain facts', () async {
      final c = await _consented(['credit_check']);
      final proof = await DioCoreApi(_coreUrl).getConsentProof(c.grants.single.txHash);
      expect(proof.txHash, c.grants.single.txHash);
      expect(proof.ledgerHead, matches(RegExp(r'^0x[0-9a-f]{64}$')));
      expect(proof.fiduciary.toLowerCase(), fiduciaryAddress.toLowerCase());
      expect(proof.purposeId.toLowerCase(), c.grants.single.purposeId.toLowerCase());
      // the signer of a consent is the data principal: the wallet shows it as "who signed"
      expect(proof.signer.toLowerCase(), c.principal.toLowerCase());
      expect(proof.eventType, 'granted');
    }, skip: skip);

    test('an access proof parses, and the wallet\'s own Merkle verifier accepts it against the anchored root', () async {
      final c = await _consented(['credit_check']);
      // the company reads data (the gateway logs it), then the log is anchored on chain
      final fired = await _json('POST', '/v1/demo/fire', {'fiduciary': fiduciaryAddress, 'purposeCode': 'credit_check', 'principal': c.principal});
      expect(fired['decision'], 'ALLOWED');
      await Future<void>.delayed(const Duration(milliseconds: 700)); // the gateway writes its log entry after answering
      await _json('POST', '/v1/demo/anchor', {'fiduciary': fiduciaryAddress});

      final api = DioCoreApi(_coreUrl);
      final proof = await api.getAccessProof(fired['entryId'] as String);
      expect(proof.entryId, fired['entryId']);
      expect(proof.decision, 'ALLOWED');
      expect(proof.purposeCode, 'credit_check');
      expect(proof.anchorTxHash, matches(RegExp(r'^0x[0-9a-f]{64}$')));
      expect(MerkleVerifier.verify(leafHash: proof.entryHash, proof: proof.merkleProof, expectedRoot: proof.merkleRoot), isTrue);
      // a wrong leaf must not verify
      expect(
        MerkleVerifier.verify(leafHash: '0x${'11' * 32}', proof: proof.merkleProof, expectedRoot: proof.merkleRoot),
        isFalse,
      );
    }, skip: skip, timeout: const Timeout(Duration(seconds: 30)));
  });
}

class _FixedCoreUrl extends CoreUrlNotifier {
  @override
  String build() => _coreUrl;
}

/// Whether the wallet's cascade row carries the processor's display name. Written as a probe on the object so
/// this test compiles (and says what is missing) whether or not the field exists yet.
bool _hasProcessorName(CascadeAckRow row) {
  try {
    final dynamic r = row;
    return (r.processorName as String?)?.isNotEmpty ?? false;
  } on Object {
    return false;
  }
}

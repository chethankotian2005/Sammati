// "Send securely" (V-01): what the phone sends the Processor, and what it asks of the user first.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/processor_api.dart';
import 'package:sammati/core/vault_flow.dart';
import 'package:sammati/core/wallet_service.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';

const _fiduciary = fiduciaryAddress;
const _reason = 'Confirm to send your details securely';
const _payload = {'pan': 'QZXWV9876K', 'incomeBand': '6-9 LPA', 'employment': 'salaried'};

void main() {
  final vectors = jsonDecode(File('../shared/test-vectors/envelope.json').readAsStringSync()) as Map<String, dynamic>;
  final processorKey = Uint8List.fromList(hex.decode(((vectors['processor'] as Map)['privateKey'] as String).substring(2)));

  late FakePresence presence;
  late WalletService wallet;
  late FakeCoreApi core;
  late FakeProcessorApi processor;
  late String principal;
  late VaultFlow flow;
  var requests = 0;

  setUp(() async {
    presence = FakePresence();
    wallet = WalletService(vault: FakeVault(), presence: presence);
    principal = await wallet.create(reason: 'setup');
    presence.prompts.clear();
    core = FakeCoreApi();
    processor = FakeProcessorApi();
    requests = 0;
    flow = VaultFlow(
      wallet: wallet,
      coreFor: (_) => core,
      processorFor: (url) {
        expect(url, 'http://processor.test:4200', reason: 'the Processor address comes from Core');
        return processor;
      },
      requestId: () => 'request-${++requests}-0000',
    );
  });

  Future<VaultSent> send({String purposeCode = 'credit_check'}) =>
      flow.send(coreUrl: 'http://core.test:4000', fiduciary: _fiduciary, purposeCode: purposeCode, reason: _reason, profile: _payload);

  test('sends only ciphertext, bound to this customer, company and purpose, and the Processor can open it', () async {
    final sent = await send();

    expect(processor.submissions, hasLength(1));
    final submission = processor.submissions.single;
    expect(submission['principal'], principal);
    expect(submission['fiduciary'], _fiduciary);
    expect(submission['purposeCode'], 'credit_check');
    // nothing in what was sent contains the data
    final wire = jsonEncode(submission);
    for (final secret in [_payload['pan']!, _payload['incomeBand']!]) {
      expect(wire, isNot(contains(secret)));
    }

    final envelope = Envelope.fromJson((submission['envelope'] as Map).cast<String, dynamic>());
    expect(sent.handle, envelope.handle);
    expect(sent.ciphertextHash, envelope.ciphertextHash);
    final ctx = EnvelopeContext(fiduciary: _fiduciary, principal: principal, purposeCode: 'credit_check');
    expect(jsonDecode(utf8.decode(await openEnvelope(envelope, processorKey, ctx))), _payload);
    await expectLater(
      openEnvelope(envelope, processorKey, EnvelopeContext(fiduciary: _fiduciary, principal: principal, purposeCode: 'marketing')),
      throwsA(isA<EnvelopeException>()),
    );
  });

  test('signs the submission as the wallet (EIP-191), behind one prompt', () async {
    await send();
    expect(presence.prompts, [_reason]);
    final submission = processor.submissions.single;
    final handle = Envelope.fromJson((submission['envelope'] as Map).cast<String, dynamic>()).handle;
    final message = submitMessage(handle, submission['requestId'] as String);
    final recovered = EthSigUtil.recoverPersonalSignature(
      signature: submission['signature'] as String,
      message: Uint8List.fromList(utf8.encode(message)),
    );
    expect(recovered.toLowerCase(), principal.toLowerCase());
  });

  test('uses a fresh envelope each time', () async {
    final a = await send();
    final b = await send();
    expect(a.handle, isNot(b.handle));
    expect(presence.prompts, hasLength(2));
  });

  test('asks Core where the Processor is, then the Processor for its key, before it asks the user for anything', () async {
    core.processorUrlError = const CoreException(CoreFailure.unreachable);
    await expectLater(send(), throwsA(isA<CoreException>()));
    expect(presence.prompts, isEmpty);

    core.processorUrlError = null;
    processor.keyError = const CoreException(CoreFailure.unreachable);
    await expectLater(send(), throwsA(isA<CoreException>()));
    expect(presence.prompts, isEmpty);
    expect(processor.submissions, isEmpty);
  });

  test('sends nothing if the user does not confirm', () async {
    presence.approve = false;
    await expectLater(send(), throwsA(isA<WalletException>().having((e) => e.failure, 'failure', WalletFailure.authFailed)));
    expect(processor.submissions, isEmpty);
  });

  test('passes on the Processor refusing for lack of consent', () async {
    processor.submitError = const VaultRefusedException('CONSENT_WITHDRAWN');
    await expectLater(send(), throwsA(isA<VaultRefusedException>().having((e) => e.code, 'code', 'CONSENT_WITHDRAWN')));
  });

  test('does not trust a receipt for something else than what it sent', () async {
    processor.wrongHandle = true;
    await expectLater(send(), throwsA(isA<CoreException>().having((e) => e.message, 'message', 'Handle mismatch')));
  });

  test('refuses without a wallet', () async {
    final empty = VaultFlow(
      wallet: WalletService(vault: FakeVault(), presence: FakePresence()),
      coreFor: (_) => core,
      processorFor: (_) => processor,
    );
    await expectLater(
      empty.send(coreUrl: 'http://core.test:4000', fiduciary: _fiduciary, purposeCode: 'credit_check', reason: _reason, profile: _payload),
      throwsA(isA<WalletException>().having((e) => e.failure, 'failure', WalletFailure.notCreated)),
    );
  });
}

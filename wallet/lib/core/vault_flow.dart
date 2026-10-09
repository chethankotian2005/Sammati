// "Send securely" (V-01, ui.md V2): encrypt the demo profile on the phone for the Sammati Processor and hand it
// the ciphertext. Plaintext exists only in the profile constant and, for the length of the seal call, in memory here;
// it is never sent, logged or kept. The user confirms with the device credential before anything is signed.

import 'dart:math';

import 'package:convert/convert.dart';

import 'core_api.dart';
import 'envelope.dart';
import 'processor_api.dart';
import 'wallet_service.dart';

class VaultSent {
  const VaultSent({required this.handle, required this.ciphertextHash, required this.version});
  final String handle;
  final String ciphertextHash;
  final int version;
}

class VaultFlow {
  VaultFlow({
    required WalletService wallet,
    required CoreApi Function(String baseUrl) coreFor,
    required ProcessorApi Function(String baseUrl) processorFor,
    String Function()? requestId,
  })  : _wallet = wallet,
        _coreFor = coreFor,
        _processorFor = processorFor,
        _requestId = requestId ?? _randomRequestId;

  final WalletService _wallet;
  final CoreApi Function(String baseUrl) _coreFor;
  final ProcessorApi Function(String baseUrl) _processorFor;
  final String Function() _requestId;

  static String _randomRequestId() {
    final r = Random.secure();
    return hex.encode(List<int>.generate(16, (_) => r.nextInt(256)));
  }

  /// Throws [WalletException] (no wallet, or the user did not confirm), [CoreException] (Core or the Processor
  /// unreachable or broken) or [VaultRefusedException] (consent is not valid, so the Processor will not store it).
  Future<VaultSent> send({
    required String coreUrl,
    required String fiduciary,
    required String purposeCode,
    required String reason,
    required Object? profile,
    required int version,
    String? consentRef,
  }) async {
    final principal = await _wallet.address();
    if (principal == null) throw const WalletException(WalletFailure.notCreated);

    // Everything that can fail on the network happens before the prompt, so the user is never asked to confirm
    // something that cannot go through.
    final processor = _processorFor(await _coreFor(coreUrl).getProcessorUrl());
    final key = await processor.getPublicKey();

    final envelope = await sealEnvelope(
      profile,
      key.publicKey,
      EnvelopeContext(fiduciary: fiduciary, principal: principal, purposeCode: purposeCode),
    );
    final requestId = _requestId();
    final signature = await _wallet.signMessage(submitMessage(envelope.handle, requestId, version), reason: reason);

    final receipt = await processor.submit(
      principal: principal,
      fiduciary: fiduciary,
      purposeCode: purposeCode,
      envelope: envelope,
      requestId: requestId,
      version: version,
      consentRef: consentRef,
      signature: signature,
    );
    // The handle is a hash of what we sent: an answer about anything else means we are not talking to the
    // Processor we think we are.
    if (receipt.handle != envelope.handle) throw const CoreException(CoreFailure.server, message: 'Handle mismatch');
    return VaultSent(handle: receipt.handle, ciphertextHash: receipt.ciphertextHash, version: receipt.version ?? version);
  }
}

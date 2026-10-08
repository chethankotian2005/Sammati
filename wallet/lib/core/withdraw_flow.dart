// Withdrawing one purpose (W5): read the current nonce, sign a WithdrawConsent
// behind a biometric prompt, record it with Core. Withdrawal is immediate and
// unconditional (trd.md §3.1), so there is no notice to compare, only the nonce.

import 'consent_flow.dart' show signatureDeadline;
import 'consents.dart';
import 'core_api.dart';
import 'eip712.dart';
import 'wallet_service.dart';

/// The purpose is not an active consent any more (already withdrawn, or never granted),
/// so there is nothing to withdraw.
class NothingToWithdrawException implements Exception {
  const NothingToWithdrawException();

  @override
  String toString() => 'NothingToWithdrawException()';
}

class WithdrawResult {
  const WithdrawResult({required this.purposeId, required this.txHash});
  final String purposeId;
  final String txHash;
}

class WithdrawFlow {
  WithdrawFlow({
    required WalletService wallet,
    required CoreApi Function(String baseUrl) apiFor,
    DateTime Function()? clock,
  })  : _wallet = wallet,
        _apiFor = apiFor,
        _clock = clock ?? DateTime.now;

  final WalletService _wallet;
  final CoreApi Function(String baseUrl) _apiFor;
  final DateTime Function() _clock;

  Future<WithdrawResult> withdraw({
    required String coreUrl,
    required String fiduciary,
    required String purposeId,
    required String reason,
  }) async {
    final principal = await _wallet.address();
    if (principal == null) throw const WalletException(WalletFailure.notCreated);

    final api = _apiFor(coreUrl);
    // Fetched fresh, not taken from the screen: the nonce moves whenever anything is signed.
    final snapshot = await api.getConsents(principal);
    final consent = snapshot.consent(fiduciary, purposeId);
    if (consent == null || consent.status != ConsentStatus.active) throw const NothingToWithdrawException();

    final message = WithdrawConsent(
      principal: principal,
      fiduciary: fiduciary,
      purposeId: consent.purposeId,
      nonce: snapshot.nonce,
      deadline: _clock().millisecondsSinceEpoch ~/ 1000 + signatureDeadline.inSeconds,
    );
    final domain = Eip712Domain(chainId: snapshot.domain.chainId, verifyingContract: snapshot.domain.verifyingContract);
    final signature = await _wallet.sign(withdrawTypedDataJson(domain, message), reason: reason);

    final tx = await api.withdraw(message.toJson(), signature);
    return WithdrawResult(purposeId: consent.purposeId, txHash: tx.txHash);
  }
}

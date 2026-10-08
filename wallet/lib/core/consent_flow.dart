// The golden-path consent steps behind W3: fetch and verify the notice, then
// sign one GrantConsent per chosen purpose behind a single biometric prompt and
// record each with Core.

import 'core_api.dart';
import 'eip712.dart';
import 'notice.dart';
import 'wallet_service.dart';

/// Consent length choices from prd.md W-03.
enum ConsentExpiry {
  days30(Duration(days: 30)),
  months6(Duration(days: 182)),
  year1(Duration(days: 365)),

  /// Only offered when Core is in DEMO_FAST_EXPIRY, so a consent can be seen to expire on stage.
  demo2m(Duration(minutes: 2));

  const ConsentExpiry(this.duration);
  final Duration duration;
}

/// How long Core has to accept a signed grant or withdrawal. Short, so a leaked signature goes stale.
const signatureDeadline = Duration(hours: 1);

class PurposeChoice {
  const PurposeChoice(this.purposeId, this.expiry);
  final String purposeId;
  final ConsentExpiry expiry;
}

class RecordedGrant {
  const RecordedGrant({required this.purposeId, required this.txHash, required this.expiresAt});
  final String purposeId;
  final String txHash;

  /// Unix seconds.
  final int expiresAt;
}

/// The notice failed a safety check, so nothing was signed.
class NoticeRejectedException implements Exception {
  const NoticeRejectedException(this.reason);
  final String reason;

  @override
  String toString() => 'NoticeRejectedException($reason)';
}

/// Posting stopped partway. [recorded] are already on the ledger and must not be sent again.
class GrantInterruptedException implements Exception {
  const GrantInterruptedException({required this.recorded, required this.cause});
  final List<RecordedGrant> recorded;
  final CoreException cause;

  @override
  String toString() => 'GrantInterruptedException(${recorded.length} recorded, $cause)';
}

class ConsentFlow {
  ConsentFlow({
    required WalletService wallet,
    required CoreApi Function(String baseUrl) apiFor,
    DateTime Function()? clock,
  })  : _wallet = wallet,
        _apiFor = apiFor,
        _clock = clock ?? DateTime.now;

  final WalletService _wallet;
  final CoreApi Function(String baseUrl) _apiFor;
  final DateTime Function() _clock;

  int get _nowSeconds => _clock().millisecondsSinceEpoch ~/ 1000;

  /// Fetches the notice for [payload] and checks it before anything is shown.
  /// Throws [NoticeRejectedException] if it does not hash to what Core claims,
  /// or if it names a different company than the QR code did.
  Future<ConsentNotice> loadNotice(QrPayload payload) async {
    final principal = await _wallet.address();
    if (principal == null) throw const WalletException(WalletFailure.notCreated);

    final notice = await _apiFor(payload.core).getNotice(payload.requestId, principal: principal);

    if (notice.fiduciary.address.toLowerCase() != payload.fiduciary.toLowerCase()) {
      throw const NoticeRejectedException('fiduciary differs from the QR code');
    }
    if (!notice.hashMatches) throw const NoticeRejectedException('noticeHash mismatch');
    return notice;
  }

  /// Signs and records a grant for each of [choices], in notice order.
  ///
  /// [shown] is the notice the user is looking at. The notice is fetched again
  /// first, for a current nonce, and the grant is refused if it no longer hashes
  /// to what the user saw: consent must be for exactly the text on screen.
  ///
  /// The contract requires nonces to be consecutive, so purpose i of the
  /// selection signs `nonce + i` and the grants are posted one after another.
  /// The signed noticeHash is the locally computed one.
  Future<List<RecordedGrant>> grant({
    required QrPayload payload,
    required ConsentNotice shown,
    required List<PurposeChoice> choices,
    required String reason,
  }) async {
    final principal = await _wallet.address();
    if (principal == null) throw const WalletException(WalletFailure.notCreated);
    if (choices.isEmpty) return const [];

    final notice = await loadNotice(payload);
    if (notice.computeNoticeHash() != shown.computeNoticeHash()) {
      throw const NoticeRejectedException('notice changed after it was shown');
    }

    final known = {for (final p in notice.purposes) p.id.toLowerCase()};
    if (!choices.every((c) => known.contains(c.purposeId.toLowerCase()))) {
      throw const NoticeRejectedException('purpose is not part of the notice');
    }

    final domain = Eip712Domain(chainId: notice.domain.chainId, verifyingContract: notice.domain.verifyingContract);
    final hash = notice.computeNoticeHash();
    final baseNonce = BigInt.parse(notice.nonce);
    final now = _nowSeconds;

    final messages = [
      for (final (i, choice) in choices.indexed)
        GrantConsent(
          principal: principal,
          fiduciary: notice.fiduciary.address,
          purposeId: choice.purposeId,
          expiresAt: now + choice.expiry.duration.inSeconds,
          noticeHash: hash,
          nonce: (baseNonce + BigInt.from(i)).toString(),
          deadline: now + signatureDeadline.inSeconds,
        ),
    ];

    final signatures = await _wallet.signAll(
      [for (final m in messages) grantTypedDataJson(domain, m)],
      reason: reason,
    );

    final api = _apiFor(payload.core);
    final recorded = <RecordedGrant>[];
    for (final (i, message) in messages.indexed) {
      try {
        final tx = await api.grant(message.toJson(), signatures[i]);
        recorded.add(RecordedGrant(purposeId: message.purposeId, txHash: tx.txHash, expiresAt: message.expiresAt));
      } on CoreException catch (e) {
        throw GrantInterruptedException(recorded: recorded, cause: e);
      }
    }
    return recorded;
  }
}

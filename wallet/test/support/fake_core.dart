import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:sammati/core/activity.dart';
import 'package:sammati/core/alerts.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/eip712.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/processor_api.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/notice.dart';
import 'package:sammati/core/proof.dart';
import 'package:sammati/core/requests.dart';
import 'package:sammati/core/rights.dart';

const fiduciaryAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const creditCheckId = '0x707a80a4813eb36bdfb3f3aebdeea292384852e7f680fd128ea1009ac1192b29';
const marketingId = '0x200aac73b1ffccefb5cbde2ae0c42cc316ec9e58f7178cc4692fffee77e36cb3';
const kycId = '0x3333333333333333333333333333333333333333333333333333333333333333';
const verifyingContract = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/// A notice as Core would serve it: Hindi and Kannada text included, so the
/// hash covers non-ASCII characters, with a correct noticeHash.
Map<String, dynamic> buildNoticeJson({String nonce = '0', String? sector}) {
  Map<String, dynamic> purpose(
    String id,
    String code,
    String en,
    String hi,
    String kn,
    List<String> categories,
    int retentionDays, {
    bool shares = false,
    bool required = false,
  }) =>
      {
        'id': id,
        'code': code,
        'title': {'en': en, 'hi': hi, 'kn': kn},
        'description': {'en': 'About $en', 'hi': 'के बारे में $hi', 'kn': '$kn ಬಗ್ಗೆ'},
        'dataCategories': categories,
        'retentionDays': retentionDays,
        'sharesThirdParty': shares,
        'required': required,
      };

  final json = <String, dynamic>{
    'requestId': 'req_test0001',
    'fiduciary': {
      'address': fiduciaryAddress,
      'name': 'QuickLoan',
      'color': '#2F5BEA',
      'sector': ?sector,
    },
    'purposes': [
      purpose(creditCheckId, 'credit_check', 'Credit check', 'क्रेडिट जाँच', 'ಕ್ರೆಡಿಟ್ ಪರಿಶೀಲನೆ', ['PAN', 'income'], 365),
      purpose(marketingId, 'marketing', 'Loan offers', 'ऋण ऑफ़र', 'ಸಾಲದ ಆಫರ್‌ಗಳು', ['phone', 'email'], 180, shares: true),
      purpose(kycId, 'kyc', 'Identity check', 'पहचान जाँच', 'ಗುರುತಿನ ಪರಿಶೀಲನೆ', ['name'], 30, required: true),
    ],
    'noticeHash': '0x',
    'noticeVersion': 1,
    'domain': {'name': 'Sammati', 'version': '1', 'chainId': 31337, 'verifyingContract': verifyingContract},
    'nonce': nonce,
  };
  json['noticeHash'] = noticeHashOf(json);
  return json;
}

/// The hash Core would compute for [json]'s text.
String noticeHashOf(Map<String, dynamic> json) => ConsentNotice.fromJson(json).computeNoticeHash();

String qrJson({String requestId = 'req_test0001', String fiduciary = fiduciaryAddress}) => jsonEncode({
      'v': 1,
      'core': 'http://core.test:4000',
      'requestId': requestId,
      'fiduciary': fiduciary,
      'name': 'QuickLoan',
    });

QrPayload testPayload() => QrPayload.tryParse(jsonDecode(qrJson()))!;

/// One consent row in the fake's ledger.
class FakeConsent {
  FakeConsent({required this.status, required this.expiresAt, required this.txHash});

  String status;
  int expiresAt;
  String txHash;
}

/// Stands in for Core, with the checks the real one makes: the nonce must match
/// exactly and then advances, and the signature must recover to the principal.
/// What Core's consent view says each purpose uses: registry ids (trd.md §4.6). The notice keeps its own free text above.
const _registryIds = {
  'credit_check': ['financial.pan', 'financial.income_band', 'financial.employment'],
  'marketing': ['contact.mobile', 'contact.email'],
  'kyc': ['identity.name'],
};

class FakeCoreApi implements CoreApi {
  FakeCoreApi({Map<String, dynamic>? notice}) : _notice = notice ?? buildNoticeJson();

  Map<String, dynamic> _notice;
  Object? noticeError;
  Object? consentsError;
  Object? activityError;

  /// Newest first, as Core sends them.
  List<ActivityItem> activity = [];
  int activityFetches = 0;

  /// Zero-based index of the grant call that fails, or -1 for none.
  int failGrantAt = -1;
  // Proofs, cascade and rights (W-07, W-08, W-10): tests that need them set these; the rest never touch them.
  ConsentProof? consentProof;
  AccessProof? accessProof;
  List<CascadeAckRow> cascadeAcks = [];
  List<RightsRequestRow> rights = [];
  final List<({String fiduciary, String type, String note})> submittedRights = [];

  @override
  Future<ConsentProof> getConsentProof(String txHash) async =>
      consentProof ?? (throw const CoreException(CoreFailure.notFound));

  @override
  Future<AccessProof> getAccessProof(String entryId) async =>
      accessProof ?? (throw const CoreException(CoreFailure.notFound));

  @override
  Future<List<CascadeAckRow>> getCascadeAcks(String principal, String purposeId) async => cascadeAcks;

  @override
  Future<List<RightsRequestRow>> getRights(String principal) async => rights;

  // --- Sammati ID and the inbox (N-01, W-14) ---
  String? identity;
  Object? identityError;
  List<InboxRequest> inbox = [];
  Object? inboxError;
  int inboxFetches = 0;
  List<BlockedCompany> blocks = [];
  final List<({String handle, String principal, int issuedAt, String signature})> registrations = [];
  final List<({String requestId, String principal, int issuedAt, String signature})> declines = [];
  final List<({String fiduciary, String action, int issuedAt, String signature})> blockCalls = [];
  Object? registerError;
  Object? actionError;

  /// Handles other wallets hold; [handleChecks] records what the account step asked about.
  final Set<String> takenHandles = {};
  final List<String> handleChecks = [];
  Object? availabilityError;

  @override
  Future<bool> handleAvailable(String handle, {String? principal}) async {
    handleChecks.add(handle);
    final e = availabilityError;
    if (e != null) throw e;
    return !takenHandles.contains(handle);
  }

  @override
  Future<String?> getIdentity(String principal) async {
    final e = identityError;
    if (e != null) throw e;
    return identity;
  }

  @override
  Future<void> registerIdentity({required String handle, required String principal, required int issuedAt, required String signature}) async {
    final e = registerError;
    if (e != null) throw e;
    registrations.add((handle: handle, principal: principal, issuedAt: issuedAt, signature: signature));
    identity = handle;
  }

  @override
  Future<List<InboxRequest>> getInbox(String principal) async {
    inboxFetches++;
    final e = inboxError;
    if (e != null) throw e;
    return List.of(inbox);
  }

  @override
  Future<void> declineRequest({required String requestId, required String principal, required int issuedAt, required String signature}) async {
    final e = actionError;
    if (e != null) throw e;
    declines.add((requestId: requestId, principal: principal, issuedAt: issuedAt, signature: signature));
    inbox = [for (final i in inbox) if (i.requestId != requestId) i];
  }

  @override
  Future<List<BlockedCompany>> getBlocks(String principal) async => List.of(blocks);

  @override
  Future<void> setBlocked({required String principal, required String fiduciary, required String action, required int issuedAt, required String signature}) async {
    final e = actionError;
    if (e != null) throw e;
    blockCalls.add((fiduciary: fiduciary, action: action, issuedAt: issuedAt, signature: signature));
    if (action == 'block') {
      blocks = [BlockedCompany(fiduciary: fiduciary, name: 'QuickLoan', blockedAt: 1760000000), ...blocks];
      inbox = [for (final i in inbox) if (i.fiduciary.toLowerCase() != fiduciary.toLowerCase()) i];
    } else {
      blocks = [for (final b in blocks) if (b.fiduciary.toLowerCase() != fiduciary.toLowerCase()) b];
    }
  }

  // --- Alerts and renewal (N-03 to N-05) ---
  List<AlertItem> alerts = [];
  List<int> alertThresholds = [259200, 86400];
  bool alertsFastExpiry = false;
  Object? alertsError;
  int alertFetches = 0;
  final List<({String id, bool read, AlertAction? action})> alertUpdates = [];
  int markAllCalls = 0;
  final List<({String fiduciary, String purposeCode})> renewals = [];
  Object? renewalError;
  String renewalRequestId = 'req_renew001';

  @override
  Future<AlertsSnapshot> getAlerts(String principal) async {
    alertFetches++;
    final e = alertsError;
    if (e != null) throw e;
    return AlertsSnapshot(items: List.of(alerts), thresholdsSeconds: alertThresholds, fastExpiry: alertsFastExpiry);
  }

  @override
  Future<void> markAllAlertsRead(String principal) async {
    markAllCalls++;
    alerts = [for (final a in alerts) a.unread ? a.copyWith(readAt: 1760000000) : a];
  }

  @override
  Future<AlertItem> updateAlert(String principal, String id, {bool read = false, AlertAction? action}) async {
    alertUpdates.add((id: id, read: read, action: action));
    final e = actionError;
    if (e != null) throw e;
    final updated = alerts.firstWhere((a) => a.id == id).copyWith(readAt: read ? 1760000000 : null, actionTaken: action);
    alerts = [for (final a in alerts) a.id == id ? updated : a];
    return updated;
  }

  @override
  Future<String> openRenewal({required String principal, required String fiduciary, required String purposeCode}) async {
    final e = renewalError;
    if (e != null) throw e;
    renewals.add((fiduciary: fiduciary, purposeCode: purposeCode));
    return renewalRequestId;
  }

  /// Where the Processor is, as Core would say (trd.md §6.1).
  String processorUrl = 'http://processor.test:4200';
  Object? processorUrlError;

  @override
  Future<String> getProcessorUrl() async {
    final error = processorUrlError;
    if (error != null) throw error;
    return processorUrl;
  }

  @override
  Future<void> submitRightsRequest(String principal, String fiduciary, String type, String note) async {
    submittedRights.add((fiduciary: fiduciary, type: type, note: note));
  }
  CoreException grantError = const CoreException(CoreFailure.server);
  CoreException? withdrawError;

  /// When set, a withdrawal waits for it, so a test can look at the screen mid-flight.
  Completer<void>? withdrawGate;

  final List<Map<String, Object>> grants = [];
  final List<String> signatures = [];
  final List<Map<String, Object>> withdrawals = [];
  final List<String> withdrawSignatures = [];
  final Map<String, FakeConsent> ledger = {};
  int noticeFetches = 0;
  int consentsFetches = 0;

  set notice(Map<String, dynamic> value) => _notice = value;

  BigInt get _baseNonce => BigInt.parse(_notice['nonce'] as String);
  String get currentNonce => (_baseNonce + BigInt.from(grants.length + withdrawals.length)).toString();

  /// Puts a consent on the ledger without a signed grant, e.g. one made earlier or on another phone.
  /// It consumes no nonce, as if made under another key's history.
  void seed(String purposeId, {String status = 'Active', required int expiresAt}) {
    ledger[purposeId] = FakeConsent(
      status: status,
      expiresAt: expiresAt,
      txHash: '0x${(0xa0 + ledger.length).toRadixString(16).padLeft(64, '0')}',
    );
  }

  @override
  Future<ConsentNotice> getNotice(String requestId, {required String principal}) async {
    noticeFetches++;
    if (noticeError != null) throw noticeError!;
    return ConsentNotice.fromJson({..._notice, 'nonce': currentNonce});
  }

  @override
  Future<TxResult> grant(Map<String, Object> request, String signature) async {
    if (grants.length == failGrantAt) throw grantError;
    grants.add(request);
    signatures.add(signature);
    final tx = _tx();
    ledger[request['purposeId']! as String] =
        FakeConsent(status: 'Active', expiresAt: request['expiresAt']! as int, txHash: tx);
    return TxResult(txHash: tx, status: 'confirmed');
  }

  @override
  Future<TxResult> withdraw(Map<String, Object> request, String signature) async {
    await withdrawGate?.future;
    if (withdrawError != null) throw withdrawError!;
    if (request['nonce'] != currentNonce) {
      throw CoreException(CoreFailure.rejected, code: 'BAD_NONCE', message: 'Expected nonce $currentNonce');
    }
    final domain = Eip712Domain(chainId: 31337, verifyingContract: verifyingContract);
    final message = WithdrawConsent(
      principal: request['principal']! as String,
      fiduciary: request['fiduciary']! as String,
      purposeId: request['purposeId']! as String,
      nonce: request['nonce']! as String,
      deadline: request['deadline']! as int,
    );
    final signer = recoverSigner(eip712Digest(withdrawTypedDataJson(domain, message)), signature);
    if (signer.toLowerCase() != message.principal.toLowerCase()) {
      throw const CoreException(CoreFailure.rejected, code: 'BAD_SIGNATURE');
    }
    final row = ledger[message.purposeId];
    if (row == null || row.status != 'Active') {
      throw const CoreException(CoreFailure.rejected, code: 'NOT_ACTIVE');
    }
    withdrawals.add(request);
    withdrawSignatures.add(signature);
    row
      ..status = 'Withdrawn'
      ..txHash = _tx();
    return TxResult(txHash: row.txHash, status: 'confirmed');
  }

  @override
  Future<ConsentsSnapshot> getConsents(String principal) async {
    consentsFetches++;
    if (consentsError != null) throw consentsError!;
    final fiduciary = _notice['fiduciary'] as Map<String, dynamic>;
    final purposes = (_notice['purposes'] as List).cast<Map<String, dynamic>>();
    return ConsentsSnapshot.fromJson({
      'principal': principal,
      'nonce': currentNonce,
      'domain': _notice['domain'],
      'fiduciaries': [
        {
          'fiduciary': {...fiduciary, 'sector': 'Fintech lending'},
          'consents': [
            for (final p in purposes)
              if (ledger[p['id']] case final row?)
                {
                  'purposeId': p['id'],
                  'code': p['code'],
                  'title': p['title'],
                  'status': row.status,
                  'grantedAt': 1,
                  'expiresAt': row.expiresAt,
                  'updatedAt': 1,
                  'noticeHash': _notice['noticeHash'],
                  'lastTx': row.txHash,
                  'required': p['required'],
                  'dataCategories': _registryIds[p['code']] ?? const <String>[],
                },
          ],
        },
      ],
    });
  }

  int _txCount = 0;
  @override
  Future<List<ActivityItem>> getActivity(String principal, {int limit = 100}) async {
    activityFetches++;
    if (activityError != null) throw activityError!;
    return activity.take(limit).toList();
  }

  String _tx() => '0x${(++_txCount).toRadixString(16).padLeft(64, '0')}';
}

/// A scripted WebSocket: tests push events and connection changes by hand.
class FakeLiveEvents implements LiveEvents {
  final _updates = StreamController<ConsentUpdated>.broadcast();
  final _access = StreamController<ActivityItem>.broadcast();
  final _connection = StreamController<bool>.broadcast();
  final _cascade = StreamController<CascadeAck>.broadcast();
  final _vault = StreamController<VaultNotice>.broadcast();
  final _requests = StreamController<ConsentRequested>.broadcast();
  final _alerts = StreamController<AlertItem>.broadcast();
  bool disposed = false;

  @override
  Stream<ConsentUpdated> get consentUpdates => _updates.stream;

  @override
  Stream<ActivityItem> get accessEvents => _access.stream;

  @override
  Stream<bool> get connection => _connection.stream;

  @override
  Stream<CascadeAck> get cascadeUpdates => _cascade.stream;

  @override
  Stream<VaultNotice> get vaultUpdates => _vault.stream;

  void emitVault(VaultNotice notice) => _vault.add(notice);

  @override
  Stream<ConsentRequested> get requestEvents => _requests.stream;

  void emitRequested(ConsentRequested event) => _requests.add(event);

  @override
  Stream<AlertItem> get alertEvents => _alerts.stream;

  void emitAlert(AlertItem item) => _alerts.add(item);

  void emitAccess(ActivityItem item) => _access.add(item);
  void emit(ConsentUpdated event) => _updates.add(event);
  void connected(bool value) => _connection.add(value);

  @override
  void dispose() => disposed = true;
}

/// The address that signed [digestHex].
String recoverSigner(String digestHex, String signature) => SignatureUtil.ecRecover(
      signature: signature,
      message: Uint8List.fromList(hex.decode(digestHex.substring(2))),
      isPersonalSign: false,
    );

/// An activity row. [at] is Unix seconds; the fixed test clock is 1760000000.
ActivityItem activityItem(
  String id,
  Decision decision,
  int at, {
  String code = 'credit_check',
  String fiduciary = fiduciaryAddress,
  String name = 'QuickLoan',
  String? reason,
  DateTime? arrivedAt,
}) =>
    ActivityItem(
      id: id,
      fiduciary: fiduciary,
      fiduciaryName: name,
      purposeCode: code,
      decision: decision,
      reason: reason ?? (decision == Decision.allowed ? 'OK' : 'CONSENT_WITHDRAWN'),
      at: at,
      arrivedAt: arrivedAt,
    );

/// The Sammati Processor as the wallet sees it. Keeps what it was handed, so a test can open the envelope with the
/// Processor key from the shared vectors and check that nothing but ciphertext arrived.
class FakeProcessorApi implements ProcessorApi {
  /// The public key of the test vectors' processor (shared/test-vectors/envelope.json).
  static const publicKeyHex = '0x368bfb005513e4139a8cf639faf29eed6c9ea74abd6150f9b81c512df29dd26e';

  Object? keyError;
  Object? submitError;

  /// Answer with a handle other than the one of the envelope that was sent.
  bool wrongHandle = false;
  int keyFetches = 0;
  final List<Map<String, Object?>> submissions = [];

  @override
  Future<ProcessorKey> getPublicKey() async {
    keyFetches++;
    final error = keyError;
    if (error != null) throw error;
    return const ProcessorKey(publicKey: publicKeyHex, mode: 'simulated-enclave');
  }

  @override
  Future<VaultReceipt> submit({
    required String principal,
    required String fiduciary,
    required String purposeCode,
    required Envelope envelope,
    required String requestId,
    required int version,
    String? consentRef,
    required String signature,
  }) async {
    final error = submitError;
    if (error != null) throw error;
    submissions.add({
      'principal': principal,
      'fiduciary': fiduciary,
      'purposeCode': purposeCode,
      'envelope': envelope.toJson(),
      'requestId': requestId,
      'version': version,
      'consentRef': consentRef,
      'signature': signature,
    });
    return VaultReceipt(handle: wrongHandle ? '0x${'00' * 32}' : envelope.handle, ciphertextHash: envelope.ciphertextHash);
  }
}

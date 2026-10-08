// Client for the Core endpoints the consent flow uses (trd.md §6.1). One
// instance per base URL: the QR code carries the Core address, so a scan can
// point at a different Core than the dev-settings default.

import 'package:dio/dio.dart';

import 'activity.dart';
import 'consents.dart';
import 'notice.dart';
import 'proof.dart';
import 'rights.dart';

enum CoreFailure { unreachable, notFound, rejected, server }

class CoreException implements Exception {
  const CoreException(this.failure, {this.code, this.message});

  final CoreFailure failure;

  /// Core's machine code, e.g. `REQUEST_NOT_FOUND`, when it sent one.
  final String? code;
  final String? message;

  @override
  String toString() => 'CoreException(${failure.name}, $code, $message)';
}

/// Contents of the console QR code (trd.md §6.1).
class QrPayload {
  const QrPayload({required this.core, required this.requestId, required this.fiduciary, required this.name});

  final String core;
  final String requestId;
  final String fiduciary;
  final String name;

  static final _address = RegExp(r'^0x[0-9a-fA-F]{40}$');

  /// Null for anything that is not a version-1 Sammati payload.
  static QrPayload? tryParse(Object? decoded) {
    if (decoded is! Map<String, dynamic> || decoded['v'] != 1) return null;
    final core = decoded['core'];
    final requestId = decoded['requestId'];
    final fiduciary = decoded['fiduciary'];
    final name = decoded['name'];
    if (core is! String || requestId is! String || fiduciary is! String || name is! String) return null;
    final uri = Uri.tryParse(core);
    final validCore = uri != null && uri.host.isNotEmpty && (uri.scheme == 'http' || uri.scheme == 'https');
    if (!validCore || requestId.isEmpty || !_address.hasMatch(fiduciary)) return null;
    return QrPayload(core: core.replaceAll(RegExp(r'/+$'), ''), requestId: requestId, fiduciary: fiduciary, name: name);
  }

  @override
  bool operator ==(Object other) =>
      other is QrPayload && other.core == core && other.requestId == requestId && other.fiduciary == fiduciary;

  @override
  int get hashCode => Object.hash(core, requestId, fiduciary);
}

class TxResult {
  const TxResult({required this.txHash, required this.status});

  final String txHash;
  final String status;
}

abstract interface class CoreApi {
  Future<ConsentNotice> getNotice(String requestId, {required String principal});

  /// [request] is the GrantConsent message (eip712.dart GrantConsent.toJson()).
  Future<TxResult> grant(Map<String, Object> request, String signature);

  /// [request] is the WithdrawConsent message (eip712.dart WithdrawConsent.toJson()).
  Future<TxResult> withdraw(Map<String, Object> request, String signature);

  Future<ConsentsSnapshot> getConsents(String principal);

  /// Newest first. Rows Core sends that the wallet cannot read are skipped, not fatal.
  Future<List<ActivityItem>> getActivity(String principal, {int limit = 100});

  /// `GET /v1/proof/consent/:txHash` (trd.md §6.1).
  Future<ConsentProof> getConsentProof(String txHash);

  /// `GET /v1/proof/access/:entryId` (trd.md §6.1).
  Future<AccessProof> getAccessProof(String entryId);

  /// `GET /v1/principals/:addr/cascade/:purposeId` (trd.md §6.1 — all acks for one purpose).
  Future<List<CascadeAckRow>> getCascadeAcks(String principal, String purposeId);

  Future<List<RightsRequestRow>> getRights(String principal);
  
  Future<void> submitRightsRequest(String principal, String fiduciary, String type, String note);
}

class DioCoreApi implements CoreApi {
  DioCoreApi(String baseUrl, {Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 6),
              receiveTimeout: const Duration(seconds: 10),
              sendTimeout: const Duration(seconds: 10),
              contentType: Headers.jsonContentType,
            ));

  final Dio _dio;

  @override
  Future<ConsentNotice> getNotice(String requestId, {required String principal}) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/requests/${Uri.encodeComponent(requestId)}',
          queryParameters: {'principal': principal},
        ));
    try {
      return ConsentNotice.fromJson(json);
    } on Object {
      // Core answered, but not with a notice we understand.
      throw const CoreException(CoreFailure.server, message: 'Malformed notice');
    }
  }

  @override
  Future<TxResult> grant(Map<String, Object> request, String signature) =>
      _postSigned('/v1/consents/grant', request, signature);

  @override
  Future<TxResult> withdraw(Map<String, Object> request, String signature) =>
      _postSigned('/v1/consents/withdraw', request, signature);

  @override
  Future<ConsentsSnapshot> getConsents(String principal) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/principals/${Uri.encodeComponent(principal)}/consents',
        ));
    try {
      return ConsentsSnapshot.fromJson(json);
    } on Object {
      throw const CoreException(CoreFailure.server, message: 'Malformed consents');
    }
  }

  @override
  Future<List<ActivityItem>> getActivity(String principal, {int limit = 100}) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/principals/${Uri.encodeComponent(principal)}/activity',
          queryParameters: {'limit': limit},
        ));
    final items = json['items'];
    if (items is! List) throw const CoreException(CoreFailure.server, message: 'Malformed activity');
    return [for (final row in items) ?ActivityItem.tryParseRow(row)];
  }

  @override
  Future<ConsentProof> getConsentProof(String txHash) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/proof/consent/${Uri.encodeComponent(txHash)}',
        ));
    try {
      return ConsentProof.fromJson(json);
    } on Object {
      throw const CoreException(CoreFailure.server, message: 'Malformed consent proof');
    }
  }

  @override
  Future<AccessProof> getAccessProof(String entryId) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/proof/access/${Uri.encodeComponent(entryId)}',
        ));
    try {
      return AccessProof.fromJson(json);
    } on Object {
      throw const CoreException(CoreFailure.server, message: 'Malformed access proof');
    }
  }

  @override
  Future<List<CascadeAckRow>> getCascadeAcks(String principal, String purposeId) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/principals/${Uri.encodeComponent(principal)}/cascade/${Uri.encodeComponent(purposeId)}',
        ));
    // Core's CascadeResponse calls the list `processors`; `acks` was an earlier guess and is still accepted.
    final rows = json['processors'] ?? json['acks'];
    if (rows is! List) throw const CoreException(CoreFailure.server, message: 'Malformed cascade acks');
    return [for (final r in rows) if (CascadeAckRow.tryParse(r) case final row?) row];
  }

  @override
  Future<List<RightsRequestRow>> getRights(String principal) async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>(
          '/v1/principals/${Uri.encodeComponent(principal)}/rights',
        ));
    final rows = json['rights'];
    if (rows is! List) throw const CoreException(CoreFailure.server, message: 'Malformed rights response');
    return [for (final r in rows) if (RightsRequestRow.tryParse(r) case final row?) row];
  }

  @override
  Future<void> submitRightsRequest(String principal, String fiduciary, String type, String note) async {
    await _send(() => _dio.post<Map<String, dynamic>>(
          '/v1/rights',
          data: {
            'principal': principal,
            'fiduciary': fiduciary,
            'type': type,
            'note': note,
          },
        ));
  }

  Future<TxResult> _postSigned(String path, Map<String, Object> request, String signature) async {
    final json = await _send(() => _dio.post<Map<String, dynamic>>(
          path,
          data: {'request': request, 'signature': signature},
        ));
    final txHash = json['txHash'];
    final status = json['status'];
    if (txHash is! String || status is! String) {
      throw const CoreException(CoreFailure.server, message: 'Malformed transaction response');
    }
    return TxResult(txHash: txHash, status: status);
  }

  Future<Map<String, dynamic>> _send(Future<Response<Map<String, dynamic>>> Function() call) async {
    try {
      final data = (await call()).data;
      if (data == null) throw const CoreException(CoreFailure.server, message: 'Empty response');
      return data;
    } on DioException catch (e) {
      throw _mapError(e);
    }
  }

  CoreException _mapError(DioException e) {
    final status = e.response?.statusCode;
    if (status == null) return CoreException(CoreFailure.unreachable, message: e.message);

    final body = e.response?.data;
    final error = body is Map<String, dynamic> ? body['error'] : null;
    final code = error is Map<String, dynamic> ? error['code'] as String? : null;
    final message = error is Map<String, dynamic> ? error['message'] as String? : null;
    final failure = switch (status) {
      404 => CoreFailure.notFound,
      >= 400 && < 500 => CoreFailure.rejected,
      _ => CoreFailure.server,
    };
    return CoreException(failure, code: code, message: message);
  }
}

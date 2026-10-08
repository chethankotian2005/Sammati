// The Sammati Processor, from the phone (trd.md §6.7): fetch its public key, hand it an envelope. It never answers
// with anything that came out of an envelope; the only reply the wallet reads is a handle and a hash.

import 'package:dio/dio.dart';

import 'core_api.dart';
import 'envelope.dart';

class ProcessorKey {
  const ProcessorKey({required this.publicKey, required this.mode});

  /// 0x-hex, 32 bytes (X25519).
  final String publicKey;

  /// `simulated-enclave` in this build: shown to the user, never presented as hardware protection.
  final String mode;
}

class VaultReceipt {
  const VaultReceipt({required this.handle, required this.ciphertextHash, this.version});
  final String handle;
  final String ciphertextHash;
  final int? version;
}

/// The Processor refused to store the envelope because consent is not valid: [code] is one of the five reason codes.
class VaultRefusedException implements Exception {
  const VaultRefusedException(this.code);
  final String code;

  @override
  String toString() => 'VaultRefusedException($code)';
}

abstract interface class ProcessorApi {
  Future<ProcessorKey> getPublicKey();

  Future<VaultReceipt> submit({
    required String principal,
    required String fiduciary,
    required String purposeCode,
    required Envelope envelope,
    required String requestId,
    required int version,
    String? consentRef,
    required String signature,
  });
}

class DioProcessorApi implements ProcessorApi {
  DioProcessorApi(String baseUrl, {Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 6),
              receiveTimeout: const Duration(seconds: 10),
              sendTimeout: const Duration(seconds: 10),
              contentType: Headers.jsonContentType,
              // A 451 is an answer to read, not an exception to catch blindly.
              validateStatus: (s) => s != null && s >= 200 && s < 300,
            ));

  final Dio _dio;

  @override
  Future<ProcessorKey> getPublicKey() async {
    final json = await _send(() => _dio.get<Map<String, dynamic>>('/v1/processor/pubkey'));
    final key = json['publicKey'];
    if (json['alg'] != 'X25519' || key is! String || !RegExp(r'^0x[0-9a-f]{64}$').hasMatch(key)) {
      throw const CoreException(CoreFailure.server, message: 'Malformed Processor key');
    }
    return ProcessorKey(publicKey: key, mode: json['mode'] as String? ?? 'unknown');
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
    final json = await _send(() => _dio.post<Map<String, dynamic>>('/v1/vault/submit', data: {
          'principal': principal,
          'fiduciary': fiduciary,
          'purposeCode': purposeCode,
          'envelope': envelope.toJson(),
          'requestId': requestId,
          'version': version,
          'consentRef': ?consentRef,
          'signature': signature,
        }));
    final handle = json['handle'];
    final hash = json['ciphertextHash'];
    if (handle is! String || hash is! String) throw const CoreException(CoreFailure.server, message: 'Malformed vault receipt');
    final v = json['version'];
    return VaultReceipt(handle: handle, ciphertextHash: hash, version: v is int ? v : null);
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

  Exception _mapError(DioException e) {
    final status = e.response?.statusCode;
    if (status == null) return CoreException(CoreFailure.unreachable, message: e.message);
    final body = e.response?.data;
    if (status == 451 && body is Map<String, dynamic> && body['code'] is String) {
      return VaultRefusedException(body['code'] as String);
    }
    final error = body is Map<String, dynamic> ? body['error'] : null;
    return CoreException(
      status >= 500 ? CoreFailure.server : CoreFailure.rejected,
      code: error is Map<String, dynamic> ? error['code'] as String? : null,
      message: error is Map<String, dynamic> ? error['message'] as String? : null,
    );
  }
}

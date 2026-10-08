import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/core_api.dart';

import 'support/fake_core.dart';

/// Answers every request with a canned response, and remembers what was asked.
class _CannedAdapter implements HttpClientAdapter {
  _CannedAdapter({this.status = 200, this.body, this.error});

  final int status;
  final Object? body;
  final DioException Function(RequestOptions)? error;
  RequestOptions? last;
  String? lastBody;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    last = options;
    if (requestStream != null) {
      lastBody = utf8.decode(await requestStream.expand((c) => c).toList());
    }
    if (error != null) throw error!(options);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

DioCoreApi _apiWith(_CannedAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://core.test:4000'))..httpClientAdapter = adapter;
  return DioCoreApi('http://core.test:4000', dio: dio);
}

Future<void> expectCoreFailure(Future<Object?> call, CoreFailure failure, {String? code}) => expectLater(
      call,
      throwsA(isA<CoreException>().having((e) => e.failure, 'failure', failure).having((e) => e.code, 'code', code)),
    );

void main() {
  group('QrPayload.tryParse', () {
    Map<String, dynamic> valid() => jsonDecode(qrJson()) as Map<String, dynamic>;

    test('accepts the trd.md §6.1 payload', () {
      final p = QrPayload.tryParse(valid())!;
      expect(p.core, 'http://core.test:4000');
      expect(p.requestId, 'req_test0001');
      expect(p.fiduciary, fiduciaryAddress);
      expect(p.name, 'QuickLoan');
    });

    test('strips a trailing slash from core', () {
      expect(QrPayload.tryParse({...valid(), 'core': 'http://core.test:4000/'})!.core, 'http://core.test:4000');
    });

    for (final (label, change) in <(String, Map<String, dynamic>)>[
      ('wrong version', {'v': 2}),
      ('missing request id', {'requestId': null}),
      ('empty request id', {'requestId': ''}),
      ('bad fiduciary address', {'fiduciary': '0x1234'}),
      ('core that is not http(s)', {'core': 'ftp://core.test'}),
      ('core with no host', {'core': 'http://'}),
      ('missing name', {'name': null}),
    ]) {
      test('rejects $label', () => expect(QrPayload.tryParse({...valid(), ...change}), isNull));
    }

    test('rejects things that are not objects', () {
      expect(QrPayload.tryParse('hello'), isNull);
      expect(QrPayload.tryParse([1, 2]), isNull);
      expect(QrPayload.tryParse(null), isNull);
    });
  });

  group('getNotice', () {
    test('parses a notice and sends the principal', () async {
      final adapter = _CannedAdapter(body: buildNoticeJson(sector: 'Fintech lending'));
      final notice = await _apiWith(adapter).getNotice('req_test0001', principal: fiduciaryAddress);

      expect(adapter.last!.path, '/v1/requests/req_test0001');
      expect(adapter.last!.queryParameters['principal'], fiduciaryAddress);
      expect(notice.fiduciary.sector, 'Fintech lending');
      expect(notice.purposes, hasLength(3));
      expect(notice.purposes.last.required, isTrue);
      expect(notice.hashMatches, isTrue);
    });

    test('404 is notFound and keeps Core\'s code', () async {
      final adapter = _CannedAdapter(status: 404, body: {
        'error': {'code': 'REQUEST_NOT_FOUND', 'message': 'Unknown request'},
      });
      await expectCoreFailure(_apiWith(adapter).getNotice('x', principal: fiduciaryAddress), CoreFailure.notFound,
          code: 'REQUEST_NOT_FOUND');
    });

    test('no response is unreachable', () async {
      final adapter = _CannedAdapter(
        error: (o) => DioException.connectionError(requestOptions: o, reason: 'no route to host'),
      );
      await expectCoreFailure(_apiWith(adapter).getNotice('x', principal: fiduciaryAddress), CoreFailure.unreachable);
    });

    test('a connection timeout is unreachable', () async {
      final adapter = _CannedAdapter(
        error: (o) => DioException.connectionTimeout(requestOptions: o, timeout: const Duration(seconds: 6)),
      );
      await expectCoreFailure(_apiWith(adapter).getNotice('x', principal: fiduciaryAddress), CoreFailure.unreachable);
    });

    test('500 is a server failure', () async {
      final adapter = _CannedAdapter(status: 500, body: {'error': {'code': 'INTERNAL', 'message': 'boom'}});
      await expectCoreFailure(_apiWith(adapter).getNotice('x', principal: fiduciaryAddress), CoreFailure.server,
          code: 'INTERNAL');
    });

    test('a reply that is not a notice is a server failure, not a crash', () async {
      final adapter = _CannedAdapter(body: {'hello': 'world'});
      await expectCoreFailure(_apiWith(adapter).getNotice('x', principal: fiduciaryAddress), CoreFailure.server);
    });
  });

  group('grant', () {
    test('posts {request, signature} and parses the tx', () async {
      final adapter = _CannedAdapter(body: {'txHash': '0xabc', 'status': 'confirmed'});
      final tx = await _apiWith(adapter).grant({'nonce': '0', 'deadline': 5}, '0xsig');

      expect(adapter.last!.method, 'POST');
      expect(adapter.last!.path, '/v1/consents/grant');
      expect(jsonDecode(adapter.lastBody!), {
        'request': {'nonce': '0', 'deadline': 5},
        'signature': '0xsig',
      });
      expect(tx.txHash, '0xabc');
      expect(tx.status, 'confirmed');
    });

    test('a rejected grant is "rejected" and keeps Core\'s code', () async {
      final adapter = _CannedAdapter(status: 400, body: {
        'error': {'code': 'DEADLINE_PASSED', 'message': 'Signature deadline has passed'},
      });
      await expectCoreFailure(_apiWith(adapter).grant({}, '0xsig'), CoreFailure.rejected, code: 'DEADLINE_PASSED');
    });
  });
}

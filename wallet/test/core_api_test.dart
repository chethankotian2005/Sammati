import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/processor_api.dart';

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

  group('getConsents', () {
    final body = {
      'principal': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'nonce': '4',
      'domain': {'name': 'Sammati', 'version': '1', 'chainId': 31337, 'verifyingContract': verifyingContract},
      'fiduciaries': [
        {
          'fiduciary': {'address': fiduciaryAddress, 'name': 'QuickLoan', 'sector': 'Fintech lending', 'color': '#2F5BEA'},
          'consents': [
            {
              'purposeId': creditCheckId,
              'code': 'credit_check',
              'title': {'en': 'Credit check', 'hi': 'h', 'kn': 'k'},
              'status': 'Active',
              'grantedAt': 1,
              'expiresAt': 1790000000,
              'updatedAt': 1,
              'noticeHash': '0x',
              'lastTx': '0xaa',
              'required': false,
            },
          ],
        },
      ],
    };

    test('reads the consents of the principal, with nonce and domain (trd.md §6.1)', () async {
      final adapter = _CannedAdapter(body: body);
      final snapshot = await _apiWith(adapter).getConsents('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');

      expect(adapter.last!.method, 'GET');
      expect(adapter.last!.path, '/v1/principals/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/consents');
      expect(snapshot.nonce, '4');
      expect(snapshot.domain.chainId, 31337);
      expect(snapshot.companies.single.consents.single.code, 'credit_check');
    });

    test('a reply without a nonce is a server failure, not a withdrawal signed with a guess', () async {
      final adapter = _CannedAdapter(body: {...body}..remove('nonce'));
      await expectCoreFailure(_apiWith(adapter).getConsents('0xabc'), CoreFailure.server);
    });

    test('no response is unreachable', () async {
      final adapter = _CannedAdapter(error: (o) => DioException.connectionError(requestOptions: o, reason: 'down'));
      await expectCoreFailure(_apiWith(adapter).getConsents('0xabc'), CoreFailure.unreachable);
    });
  });

  group('withdraw', () {
    test('posts {request, signature} to /v1/consents/withdraw', () async {
      final adapter = _CannedAdapter(body: {'txHash': '0xdef', 'status': 'confirmed'});
      final tx = await _apiWith(adapter).withdraw({'nonce': '2'}, '0xsig');

      expect(adapter.last!.method, 'POST');
      expect(adapter.last!.path, '/v1/consents/withdraw');
      expect(jsonDecode(adapter.lastBody!), {
        'request': {'nonce': '2'},
        'signature': '0xsig',
      });
      expect(tx.txHash, '0xdef');
    });

    test('a wrong nonce is "rejected" with BAD_NONCE', () async {
      final adapter = _CannedAdapter(status: 409, body: {
        'error': {'code': 'BAD_NONCE', 'message': 'Expected nonce 3, got 2'},
      });
      await expectCoreFailure(_apiWith(adapter).withdraw({}, '0xsig'), CoreFailure.rejected, code: 'BAD_NONCE');
    });
  });

  group('getActivity', () {
    Map<String, dynamic> row(String id, {String decision = 'ALLOWED'}) => {
          'id': id,
          'seq': 1,
          'fiduciary': fiduciaryAddress,
          'fiduciaryName': 'QuickLoan',
          'purposeCode': 'credit_check',
          'decision': decision,
          'reason': decision == 'ALLOWED' ? 'OK' : 'CONSENT_WITHDRAWN',
          'endpoint': 'GET /x',
          'at': 1760000000,
          'anchored': false,
        };

    test('reads the feed, asking for a limit', () async {
      final adapter = _CannedAdapter(body: {
        'principal': '0xabc',
        'items': [row('a'), row('b', decision: 'BLOCKED')],
      });
      final items = await _apiWith(adapter).getActivity('0xabc', limit: 50);

      expect(adapter.last!.path, '/v1/principals/0xabc/activity');
      expect(adapter.last!.queryParameters['limit'], 50);
      expect(items.map((i) => i.id), ['a', 'b']);
      expect(items.last.reason, 'CONSENT_WITHDRAWN');
    });

    test('skips a row it cannot read instead of failing the whole feed', () async {
      final adapter = _CannedAdapter(body: {
        'items': [row('a'), {'id': 'broken'}, row('c')],
      });
      expect((await _apiWith(adapter).getActivity('0xabc')).map((i) => i.id), ['a', 'c']);
    });

    test('a reply with no items is a server failure', () async {
      final adapter = _CannedAdapter(body: {'hello': 'world'});
      await expectCoreFailure(_apiWith(adapter).getActivity('0xabc'), CoreFailure.server);
    });

    test('no response is unreachable', () async {
      final adapter = _CannedAdapter(error: (o) => DioException.connectionError(requestOptions: o, reason: 'down'));
      await expectCoreFailure(_apiWith(adapter).getActivity('0xabc'), CoreFailure.unreachable);
    });
  });

  group('getProcessorUrl (GET /v1/processor)', () {
    test('reads the address Core names, without a trailing slash', () async {
      final adapter = _CannedAdapter(body: {'url': 'http://192.168.1.5:4200/'});
      expect(await _apiWith(adapter).getProcessorUrl(), 'http://192.168.1.5:4200');
      expect(adapter.last!.path, '/v1/processor');
    });

    test('an address that is not http(s) is a server failure', () async {
      await expectCoreFailure(_apiWith(_CannedAdapter(body: {'url': 'javascript:alert(1)'})).getProcessorUrl(), CoreFailure.server);
      await expectCoreFailure(_apiWith(_CannedAdapter(body: {'nope': 1})).getProcessorUrl(), CoreFailure.server);
    });
  });

  group('DioProcessorApi', () {
    DioProcessorApi processorWith(_CannedAdapter adapter) {
      final dio = Dio(BaseOptions(baseUrl: 'http://processor.test:4200', validateStatus: (s) => s != null && s >= 200 && s < 300))
        ..httpClientAdapter = adapter;
      return DioProcessorApi('http://processor.test:4200', dio: dio);
    }

    const key = '0x368bfb005513e4139a8cf639faf29eed6c9ea74abd6150f9b81c512df29dd26e';
    final envelope = Envelope(ephPub: '0x${'11' * 32}', nonce: '0x${'22' * 12}', ciphertext: '0x${'33' * 5}', tag: '0x${'44' * 16}');

    Future<VaultReceipt> submit(DioProcessorApi api) => api.submit(
          principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          fiduciary: fiduciaryAddress,
          purposeCode: 'credit_check',
          envelope: envelope,
          requestId: 'request-1-0000',
          signature: '0xsig',
        );

    test('reads the public key', () async {
      final adapter = _CannedAdapter(body: {'v': 1, 'alg': 'X25519', 'publicKey': key, 'mode': 'simulated-enclave'});
      final got = await processorWith(adapter).getPublicKey();
      expect([got.publicKey, got.mode], [key, 'simulated-enclave']);
    });

    test('refuses a key that is not 32 bytes of X25519', () async {
      await expectCoreFailure(processorWith(_CannedAdapter(body: {'alg': 'X25519', 'publicKey': '0x1234'})).getPublicKey(), CoreFailure.server);
      await expectCoreFailure(processorWith(_CannedAdapter(body: {'alg': 'RSA', 'publicKey': key})).getPublicKey(), CoreFailure.server);
    });

    test('posts the envelope and the signed request, and reads the handle back', () async {
      final adapter = _CannedAdapter(status: 201, body: {'handle': '0xaa', 'ciphertextHash': '0xbb'});
      final got = await submit(processorWith(adapter));
      expect([got.handle, got.ciphertextHash], ['0xaa', '0xbb']);
      expect(adapter.last!.path, '/v1/vault/submit');
      final sent = jsonDecode(adapter.lastBody!) as Map<String, dynamic>;
      expect(sent.keys.toSet(), {'principal', 'fiduciary', 'purposeCode', 'envelope', 'requestId', 'signature'});
      expect(sent['envelope'], envelope.toJson());
    });

    test('a 451 is a refusal carrying the reason code', () async {
      final adapter = _CannedAdapter(status: 451, body: {'code': 'CONSENT_WITHDRAWN', 'message': 'x'});
      await expectLater(submit(processorWith(adapter)), throwsA(isA<VaultRefusedException>().having((e) => e.code, 'code', 'CONSENT_WITHDRAWN')));
    });

    test('other refusals and no answer map like the Core client does', () async {
      await expectCoreFailure(submit(processorWith(_CannedAdapter(status: 400, body: {'error': {'code': 'BAD_SIGNATURE', 'message': 'x'}}))), CoreFailure.rejected, code: 'BAD_SIGNATURE');
      await expectCoreFailure(submit(processorWith(_CannedAdapter(status: 500, body: {'error': {'code': 'INTERNAL', 'message': 'x'}}))), CoreFailure.server, code: 'INTERNAL');
      final down = _CannedAdapter(error: (o) => DioException.connectionError(requestOptions: o, reason: 'down'));
      await expectCoreFailure(submit(processorWith(down)), CoreFailure.unreachable);
    });
  });
}

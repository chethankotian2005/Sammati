import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/activity.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/live_events.dart';

import 'support/fake_core.dart';

const _principal = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

String _event({String principal = _principal, String status = 'Withdrawn'}) => jsonEncode({
      'event': 'consent.updated',
      'principal': principal,
      'fiduciary': fiduciaryAddress,
      'purposeId': creditCheckId,
      'purposeCode': 'credit_check',
      'status': status,
      'expiresAt': null,
      'txHash': '0xee',
      'at': 1,
    });

String _access({String principal = _principal, String id = 'entry-1'}) => jsonEncode({
      'event': 'access.logged',
      'principal': principal,
      'fiduciary': fiduciaryAddress,
      'fiduciaryName': 'QuickLoan',
      'entryId': id,
      'seq': 3,
      'purposeCode': 'marketing',
      'decision': 'BLOCKED',
      'reason': 'CONSENT_WITHDRAWN',
      'endpoint': 'GET /customers/:id/profile',
      'at': 1760000000,
    });

/// A WebSocket server standing in for Core's /ws. Records what the client sends.
class _Server {
  _Server._(this._http);

  final HttpServer _http;
  final sockets = <WebSocket>[];
  final received = <String>[];
  final _connected = StreamController<WebSocket>.broadcast();

  static Future<_Server> start({int port = 0}) async {
    final http = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    final server = _Server._(http);
    http.listen((request) async {
      if (request.uri.path != '/ws') {
        request.response
          ..statusCode = 404
          ..close();
        return;
      }
      final socket = await WebSocketTransformer.upgrade(request);
      server.sockets.add(socket);
      socket.listen((m) => server.received.add(m as String), onError: (_) {});
      server._connected.add(socket);
    });
    return server;
  }

  int get port => _http.port;
  String get url => 'http://127.0.0.1:$port';
  Future<WebSocket> nextConnection() => _connected.stream.first;

  Future<void> stop() async {
    for (final s in sockets) {
      await s.close();
    }
    await _http.close(force: true);
  }
}

void main() {
  test('webSocketUri maps http(s) to ws(s) on /ws', () {
    expect(webSocketUri('http://192.168.1.5:4000').toString(), 'ws://192.168.1.5:4000/ws');
    expect(webSocketUri('https://core.example').toString(), 'wss://core.example/ws');
    expect(webSocketUri('http://192.168.1.5:4000/').toString(), 'ws://192.168.1.5:4000/ws');
  });

  group('WsLiveEvents against a real socket', () {
    late _Server server;
    late WsLiveEvents live;

    setUp(() async => server = await _Server.start());

    tearDown(() async {
      live.dispose();
      await server.stop();
    });

    test('subscribes to the principal\'s topic and delivers consent.updated', () async {
      final firstConnection = server.nextConnection();
      live = WsLiveEvents(server.url, _principal);
      final updates = <ConsentUpdated>[];
      live.consentUpdates.listen(updates.add);

      final socket = await firstConnection.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(jsonDecode(server.received.single), {'sub': ['principal:${_principal.toLowerCase()}']});

      socket.add(_event());
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(updates.single.status, ConsentStatus.withdrawn);
      expect(updates.single.purposeId, creditCheckId);
    });

    test('ignores other event types, other principals and junk frames without dropping the socket', () async {
      final firstConnection = server.nextConnection();
      live = WsLiveEvents(server.url, _principal);
      final updates = <ConsentUpdated>[];
      live.consentUpdates.listen(updates.add);
      final socket = await firstConnection.timeout(const Duration(seconds: 5));

      socket
        ..add('not json')
        ..add(jsonEncode({'event': 'access.logged', 'principal': _principal}))
        ..add(_event(principal: '0x0000000000000000000000000000000000000001'))
        ..add(_event(status: 'Active'));
      await Future<void>.delayed(const Duration(milliseconds: 300));

      expect(updates, hasLength(1));
      expect(updates.single.status, ConsentStatus.active);
    });

    test('delivers access.logged as a live activity row, apart from consent updates', () async {
      final firstConnection = server.nextConnection();
      final arrival = DateTime.utc(2025, 10, 9, 8, 53, 20);
      live = WsLiveEvents(server.url, _principal, clock: () => arrival);
      final rows = <ActivityItem>[];
      final consents = <ConsentUpdated>[];
      live.accessEvents.listen(rows.add);
      live.consentUpdates.listen(consents.add);
      final socket = await firstConnection.timeout(const Duration(seconds: 5));

      socket
        ..add(_access())
        ..add(_access(principal: '0x0000000000000000000000000000000000000001', id: 'someone-else'))
        ..add(_event());
      await Future<void>.delayed(const Duration(milliseconds: 300));

      expect(rows, hasLength(1), reason: 'a row for another principal is dropped');
      expect(rows.single.id, 'entry-1');
      expect(rows.single.decision, Decision.blocked);
      expect(rows.single.purposeCode, 'marketing');
      expect(rows.single.arrivedAt, arrival, reason: 'stamped on arrival, which earns it the entrance animation');
      expect(consents, hasLength(1));
    });

    test('reports a drop, reconnects by itself and subscribes again', () async {
      final firstConnection = server.nextConnection();
      live = WsLiveEvents(server.url, _principal);
      final states = <bool>[];
      live.connection.listen(states.add);

      final first = await firstConnection.timeout(const Duration(seconds: 5));
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(states, [true]);

      final secondConnection = server.nextConnection();
      await first.close();
      await secondConnection.timeout(const Duration(seconds: 10));
      await Future<void>.delayed(const Duration(milliseconds: 300));

      expect(states, [true, false, true]);
      expect(server.received.where((m) => m.contains('principal:')), hasLength(2), reason: 'subscribed on each connection');
    });

    test('keeps retrying while Core is down, then connects when it comes back', () async {
      final port = server.port;
      await server.stop();
      live = WsLiveEvents('http://127.0.0.1:$port', _principal);
      final states = <bool>[];
      live.connection.listen(states.add);
      await Future<void>.delayed(const Duration(milliseconds: 500));
      expect(states, isEmpty, reason: 'never connected, so nothing to report as dropped');

      server = await _Server.start(port: port);
      final connected = server.nextConnection();
      await connected.timeout(const Duration(seconds: 10));
      await Future<void>.delayed(const Duration(milliseconds: 200));
      expect(states, [true]);
    });

    test('dispose stops it for good', () async {
      final firstConnection = server.nextConnection();
      live = WsLiveEvents(server.url, _principal);
      await firstConnection.timeout(const Duration(seconds: 5));

      live.dispose();
      await Future<void>.delayed(const Duration(seconds: 2));
      expect(server.sockets, hasLength(1), reason: 'no reconnect after dispose');
    });
  });
}

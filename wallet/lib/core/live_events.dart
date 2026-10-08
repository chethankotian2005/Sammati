// Live consent updates over Core's WebSocket (trd.md §6.5). Reconnects by itself;
// every reconnect is reported so the owner can refetch what it missed meanwhile.

import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';

import 'activity.dart';
import 'consents.dart';

/// One processor acknowledgement row from the `cascade.updated` WebSocket event
/// (trd.md §6.5, drd.md §3 cascade_acks).
class CascadeAck {
  const CascadeAck({
    required this.principal,
    required this.purposeId,
    required this.processor,
    required this.notifiedAt,
    this.processorName,
    this.ackedAt,
    this.txHash,
  });

  /// Returns null for any frame that is not a cascade.updated event or is malformed.
  static CascadeAck? tryParse(Object? decoded) {
    if (decoded is! Map<String, dynamic> || decoded['event'] != 'cascade.updated') return null;
    try {
      return CascadeAck(
        principal: decoded['principal'] as String,
        purposeId: decoded['purposeId'] as String,
        processor: decoded['processor'] as String,
        // Core sends notifiedAt: null for an acknowledgement replayed from chain history (it never saw the
        // notification): that is still an acknowledgement, so fall back to when it was acknowledged.
        notifiedAt: (decoded['notifiedAt'] ?? decoded['ackedAt']) as int,
        processorName: decoded['processorName'] as String?,
        ackedAt: decoded['ackedAt'] as int?,
        txHash: decoded['txHash'] as String?,
      );
    } on TypeError {
      return null;
    }
  }

  final String principal;
  final String purposeId;
  final String processor;
  final String? processorName;

  /// Unix seconds when the processor was notified.
  final int notifiedAt;

  /// Unix seconds when the processor signed the acknowledgement. Null until it arrives.
  final int? ackedAt;

  /// On-chain tx hash of the acknowledgement, set after the chain call succeeds.
  final String? txHash;

  bool get acknowledged => ackedAt != null;
}

abstract interface class LiveEvents {
  /// `consent.updated` events for the subscribed principal.
  Stream<ConsentUpdated> get consentUpdates;

  /// `access.logged` events for the subscribed principal, stamped with their arrival time.
  Stream<ActivityItem> get accessEvents;

  /// `cascade.updated` events: each processor acknowledgement as it arrives.
  Stream<CascadeAck> get cascadeUpdates;

  /// True each time the socket (re)connects, false each time it drops.
  Stream<bool> get connection;

  void dispose();
}

typedef LiveEventsFactory = LiveEvents Function(String coreUrl, String principal);

/// `http://host:4000` -> `ws://host:4000/ws`.
Uri webSocketUri(String coreUrl) {
  final base = Uri.parse(coreUrl);
  return base.replace(scheme: base.scheme == 'https' ? 'wss' : 'ws', path: '/ws', query: null);
}

class WsLiveEvents implements LiveEvents {
  WsLiveEvents(String coreUrl, this._principal, {DateTime Function()? clock})
      : _uri = webSocketUri(coreUrl),
        _clock = clock ?? DateTime.now {
    unawaited(_run());
  }

  static const _backoffs = [Duration(seconds: 1), Duration(seconds: 2), Duration(seconds: 4), Duration(seconds: 8)];

  final Uri _uri;
  final String _principal;
  final DateTime Function() _clock;
  final _updates = StreamController<ConsentUpdated>.broadcast();
  final _access = StreamController<ActivityItem>.broadcast();
  final _cascade = StreamController<CascadeAck>.broadcast();
  final _connection = StreamController<bool>.broadcast();
  bool _disposed = false;
  IOWebSocketChannel? _channel;

  @override
  Stream<ConsentUpdated> get consentUpdates => _updates.stream;

  @override
  Stream<ActivityItem> get accessEvents => _access.stream;

  @override
  Stream<CascadeAck> get cascadeUpdates => _cascade.stream;

  @override
  Stream<bool> get connection => _connection.stream;

  Future<void> _run() async {
    var attempt = 0;
    while (!_disposed) {
      var opened = false;
      try {
        // A ping every few seconds is what notices a silently dropped Wi-Fi link.
        final channel = IOWebSocketChannel.connect(_uri, pingInterval: const Duration(seconds: 5));
        _channel = channel;
        await channel.ready;
        opened = true;
        attempt = 0;
        channel.sink.add(jsonEncode({'sub': ['principal:${_principal.toLowerCase()}']}));
        _emit(_connection, true);
        await for (final message in channel.stream) {
          _handle(message);
        }
      } on Object {
        // Falls through to the reconnect below; the cause is not actionable for the user.
      }
      if (_disposed) return;
      if (opened) _emit(_connection, false);
      await Future<void>.delayed(_backoffs[attempt.clamp(0, _backoffs.length - 1)]);
      attempt++;
    }
  }

  void _handle(Object? message) {
    if (message is! String) return;
    try {
      final decoded = jsonDecode(message);
      // The subscription is per principal, but a frame for anyone else is dropped regardless.
      if (decoded is! Map<String, dynamic> || !_isMine(decoded['principal'])) return;
      final consent = ConsentUpdated.tryParse(decoded);
      if (consent != null) _emit(_updates, consent);
      final access = ActivityItem.tryParseEvent(decoded, arrivedAt: _clock());
      if (access != null) _emit(_access, access);
      final cascade = CascadeAck.tryParse(decoded);
      if (cascade != null) _emit(_cascade, cascade);
    } on FormatException {
      // A malformed frame must not take the socket down.
    }
  }

  bool _isMine(Object? principal) => principal is String && principal.toLowerCase() == _principal.toLowerCase();

  void _emit<T>(StreamController<T> controller, T value) {
    if (!controller.isClosed) controller.add(value);
  }

  @override
  void dispose() {
    _disposed = true;
    _channel?.sink.close();
    unawaited(_updates.close());
    unawaited(_access.close());
    unawaited(_cascade.close());
    unawaited(_connection.close());
  }
}

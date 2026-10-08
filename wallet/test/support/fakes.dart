import 'package:sammati/core/notifications.dart';
import 'package:sammati/core/wallet_service.dart';

class FakeVault implements KeyVault {
  final Map<String, String> data = {};
  final List<String> reads = [];
  bool failWrites = false;

  @override
  Future<String?> read(String name) async {
    reads.add(name);
    return data[name];
  }

  @override
  Future<void> write(String name, String value) async {
    if (failWrites) throw StateError('disk full');
    data[name] = value;
  }
}

class FakePresence implements UserPresence {
  FakePresence({this.available = true, this.approve = true});

  bool available;
  bool approve;
  final List<String> prompts = [];

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<bool> confirm(String reason) async {
    prompts.add(reason);
    return approve;
  }
}

/// What the phone was asked to show or schedule, for tests of alerts (notifications.dart).
class RecordingNotifier implements LocalNotifier {
  final shown = <({int id, String title, String body, String channel})>[];
  final scheduled = <({int id, DateTime at, String title, String body})>[];
  int cancelled = 0;

  @override
  Future<void> show({required int id, required String title, required String body, required String channel}) async => shown.add((id: id, title: title, body: body, channel: channel));

  @override
  Future<void> schedule({required int id, required DateTime at, required String title, required String body, required String channel}) async => scheduled.add((id: id, at: at, title: title, body: body));

  @override
  Future<void> cancelAll() async {
    cancelled++;
    scheduled.clear();
  }
}

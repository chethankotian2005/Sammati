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

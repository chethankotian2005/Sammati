// secp256k1 key for the citizen wallet (trd.md §4.2). Persistence behind
// flutter_secure_storage + local_auth is a separate step; this is only
// generation and address derivation.

import 'dart:math';

import 'package:web3dart/web3dart.dart';

class WalletKey {
  WalletKey._(this._key);

  factory WalletKey.generate() => WalletKey._(EthPrivateKey.createRandom(Random.secure()));

  factory WalletKey.fromHex(String privateKeyHex) => WalletKey._(EthPrivateKey.fromHex(privateKeyHex));

  final EthPrivateKey _key;

  // Via the integer: the byte form can carry a leading sign byte (33 bytes) when the high bit is set.
  String get privateKeyHex => '0x${_key.privateKeyInt.toRadixString(16).padLeft(64, '0')}';

  /// EIP-55 checksummed address.
  String get address => _key.address.hexEip55;
}

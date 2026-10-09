// Vault envelope (trd.md §4.4): the customer's details are encrypted on the phone for the Sammati Processor, so
// only ciphertext ever leaves it. X25519 + HKDF-SHA256 + AES-256-GCM, with the customer, company and purpose as
// additional authenticated data.
//
// Dart copy of shared/src/envelope.ts. It must agree with it byte for byte: test/envelope_test.dart runs it
// against shared/test-vectors/envelope.json, which the TypeScript side passes too.

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:cryptography/cryptography.dart';
import 'package:web3dart/crypto.dart' show keccak256;

import 'notice.dart' show canonicalJson;

const envelopeVersion = 1;
const _hkdfInfo = 'sammati-vault-v1';
const _submitPrefix = 'sammati-vault-submit:v2:';

/// What an envelope is bound to. Moving the ciphertext to another customer, company or purpose makes it unreadable.
class EnvelopeContext {
  const EnvelopeContext({required this.fiduciary, required this.principal, required this.purposeCode});
  final String fiduciary;
  final String principal;
  final String purposeCode;
}

class Envelope {
  const Envelope({required this.ephPub, required this.nonce, required this.ciphertext, required this.tag});

  /// Every binary field is lower-case 0x-hex, as in the TypeScript definition.
  final String ephPub;
  final String nonce;
  final String ciphertext;
  final String tag;

  factory Envelope.fromJson(Map<String, dynamic> json) {
    // The version is part of the format: an envelope of a version this code does not know is not opened as if it were v1.
    if (json['v'] != envelopeVersion) throw const EnvelopeException('unsupported envelope version');
    return Envelope(
      ephPub: json['ephPub'] as String,
      nonce: json['nonce'] as String,
      ciphertext: json['ciphertext'] as String,
      tag: json['tag'] as String,
    );
  }

  Map<String, Object> toJson() => {'v': envelopeVersion, 'ephPub': ephPub, 'nonce': nonce, 'ciphertext': ciphertext, 'tag': tag};

  /// The canonical JSON bytes: what the vault stores and what the handle hashes.
  Uint8List get bytes => Uint8List.fromList(utf8.encode(canonicalJson(toJson())));

  /// handle = keccak256(canonical envelope bytes).
  String get handle => _hex(keccak256(bytes));

  /// ciphertextHash = keccak256(ciphertext || tag).
  String get ciphertextHash => _hex(keccak256(Uint8List.fromList([..._unhex(ciphertext), ..._unhex(tag)])));
}

/// The message the principal signs (EIP-191) to submit an envelope.
String submitMessage(String handle, String requestId, int version) => '$_submitPrefix$handle:$requestId:$version';

/// The GCM additional data: the context as canonical JSON with both addresses lower-cased.
Uint8List envelopeAad(EnvelopeContext ctx) => Uint8List.fromList(utf8.encode(canonicalJson({
      'fiduciary': ctx.fiduciary.toLowerCase(),
      'principal': ctx.principal.toLowerCase(),
      'purposeCode': ctx.purposeCode,
      'v': envelopeVersion,
    })));

/// The envelope could not be opened (tests and the Processor's own checks); the message never carries data.
class EnvelopeException implements Exception {
  const EnvelopeException(this.message);
  final String message;

  @override
  String toString() => 'EnvelopeException($message)';
}

String _hex(List<int> bytes) => '0x${hex.encode(bytes)}';

Uint8List _unhex(String value) {
  final body = value.startsWith('0x') ? value.substring(2) : value;
  return Uint8List.fromList(hex.decode(body));
}

final _x25519 = X25519();
final _aes = AesGcm.with256bits(nonceLength: 12);
final _hkdf = Hkdf(hmac: Hmac.sha256(), outputLength: 32);

Future<SecretKey> _deriveKey(SecretKey shared, Uint8List ephPub, Uint8List processorPub) async {
  final sharedBytes = await shared.extractBytes();
  if (sharedBytes.every((b) => b == 0)) throw const EnvelopeException('degenerate key exchange');
  return _hkdf.deriveKey(
    secretKey: shared,
    nonce: [...ephPub, ...processorPub], // HKDF's salt
    info: utf8.encode(_hkdfInfo),
  );
}

Uint8List _randomBytes(int n) {
  final r = Random.secure();
  return Uint8List.fromList(List<int>.generate(n, (_) => r.nextInt(256)));
}

/// Encrypts [payload] (any canonical-JSON value) for the Processor's X25519 public key (0x-hex, 32 bytes).
/// [ephemeralPrivateKey] and [nonce] are for test vectors only; leave them out in the app.
Future<Envelope> sealEnvelope(
  Object? payload,
  String processorPublicKey,
  EnvelopeContext ctx, {
  Uint8List? ephemeralPrivateKey,
  Uint8List? nonce,
}) async {
  final processorPub = _unhex(processorPublicKey);
  if (processorPub.length != 32) throw const EnvelopeException('the Processor public key is not 32 bytes');
  final ephemeral = await _x25519.newKeyPairFromSeed(ephemeralPrivateKey ?? _randomBytes(32));
  final ephPub = Uint8List.fromList((await ephemeral.extractPublicKey()).bytes);
  final shared = await _x25519.sharedSecretKey(
    keyPair: ephemeral,
    remotePublicKey: SimplePublicKey(processorPub, type: KeyPairType.x25519),
  );
  final key = await _deriveKey(shared, ephPub, processorPub);
  final iv = nonce ?? _randomBytes(12);
  final box = await _aes.encrypt(
    utf8.encode(canonicalJson(payload)),
    secretKey: key,
    nonce: iv,
    aad: envelopeAad(ctx),
  );
  return Envelope(ephPub: _hex(ephPub), nonce: _hex(iv), ciphertext: _hex(box.cipherText), tag: _hex(box.mac.bytes));
}

/// Opens an envelope with the Processor's private key. The app never does this (only the Processor can);
/// it exists so the test vectors can prove both directions.
Future<Uint8List> openEnvelope(Envelope envelope, Uint8List processorPrivateKey, EnvelopeContext ctx) async {
  try {
    final processor = await _x25519.newKeyPairFromSeed(processorPrivateKey);
    final processorPub = Uint8List.fromList((await processor.extractPublicKey()).bytes);
    final ephPub = _unhex(envelope.ephPub);
    if (ephPub.length != 32) throw const EnvelopeException('bad ephemeral key');
    final shared = await _x25519.sharedSecretKey(
      keyPair: processor,
      remotePublicKey: SimplePublicKey(ephPub, type: KeyPairType.x25519),
    );
    final key = await _deriveKey(shared, ephPub, processorPub);
    final clear = await _aes.decrypt(
      SecretBox(_unhex(envelope.ciphertext), nonce: _unhex(envelope.nonce), mac: Mac(_unhex(envelope.tag))),
      secretKey: key,
      aad: envelopeAad(ctx),
    );
    return Uint8List.fromList(clear);
  } on Object {
    // Whatever went wrong, the answer is the same fixed one.
    throw const EnvelopeException('the envelope could not be opened');
  }
}

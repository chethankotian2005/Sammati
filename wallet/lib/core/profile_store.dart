// The profile vault (W-16, trd.md §5 "Profile vault"): the profile document is AES-256-GCM ciphertext in the
// platform's secure storage, under a random profile key that is read only after the device-credential check succeeds,
// the same seam that gates the wallet key. Nothing here touches the network.

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:cryptography/cryptography.dart';

import 'profile.dart';
import 'wallet_service.dart';

const _keyName = 'profile_key';
const _blobName = 'profile_blob';
final _aad = utf8.encode('sammati-profile-v1');

enum ProfileFailure {
  /// The person did not pass the device check, or the phone has no lock: nothing is opened.
  locked,

  /// The stored blob failed authentication or could not be read: it is treated as lost, never half-shown.
  lost,

  storageFailed,
}

class ProfileException implements Exception {
  const ProfileException(this.failure);
  final ProfileFailure failure;

  @override
  String toString() => 'ProfileException(${failure.name})';
}

/// What an open profile holds while the app is in the foreground: the decrypted document and the key, so each save
/// does not ask again. Dropped on lock.
class ProfileSession {
  ProfileSession(this.key, this.doc);

  final Uint8List key;
  final ProfileDoc doc;
}

class ProfileStore {
  ProfileStore({required KeyVault vault, required UserPresence presence, Random? random})
      : _vault = vault,
        _presence = presence,
        _random = random ?? Random.secure();

  final KeyVault _vault;
  final UserPresence _presence;
  final Random _random;
  final _gcm = AesGcm.with256bits();

  /// Whether a profile has ever been saved on this phone. No prompt: it reveals nothing but existence.
  Future<bool> exists() async {
    try {
      return await _vault.read(_blobName) != null;
    } catch (_) {
      throw const ProfileException(ProfileFailure.storageFailed);
    }
  }

  /// Starts a profile on a phone that has none, without a prompt: a new key protects nothing that exists yet, and the
  /// person has just passed the device check to create the wallet (account setup). Replaces any unreadable remains.
  Future<ProfileSession> create(ProfileDoc doc) async {
    final key = _randomBytes(32);
    final session = ProfileSession(key, doc);
    await _write(session);
    return session;
  }

  /// Opens the profile after the device check. Returns an empty document with a fresh key when none was ever saved.
  Future<ProfileSession> open({required String reason}) async {
    if (!await _presence.isAvailable() || !await _presence.confirm(reason)) {
      throw const ProfileException(ProfileFailure.locked);
    }
    String? keyHex;
    String? blob;
    try {
      keyHex = await _vault.read(_keyName);
      blob = await _vault.read(_blobName);
    } catch (_) {
      throw const ProfileException(ProfileFailure.storageFailed);
    }
    if (blob == null) return ProfileSession(_randomBytes(32), const ProfileDoc());
    if (keyHex == null) throw const ProfileException(ProfileFailure.lost);
    try {
      final key = Uint8List.fromList(hex.decode(keyHex));
      final raw = base64.decode(blob);
      if (raw.length < 12 + 16) throw const FormatException('Blob too short');
      final box = SecretBox(raw.sublist(12, raw.length - 16), nonce: raw.sublist(0, 12), mac: Mac(raw.sublist(raw.length - 16)));
      final clear = await _gcm.decrypt(box, secretKey: SecretKey(key), aad: _aad);
      final doc = ProfileDoc.fromJson(jsonDecode(utf8.decode(clear)) as Map<String, dynamic>);
      return ProfileSession(key, doc);
    } catch (_) {
      throw const ProfileException(ProfileFailure.lost);
    }
  }

  /// Encrypts [session]'s document under its key with a fresh nonce and stores it.
  Future<void> save(ProfileSession session) => _write(session);

  Future<void> _write(ProfileSession session) async {
    final nonce = _randomBytes(12);
    final box = await _gcm.encrypt(utf8.encode(jsonEncode(session.doc.toJson())), secretKey: SecretKey(session.key), nonce: nonce, aad: _aad);
    final blob = base64.encode([...box.nonce, ...box.cipherText, ...box.mac.bytes]);
    try {
      // Key first: if the blob write fails the old blob is still readable with the old key only if the key is unchanged,
      // so a new key is written only when this is a new profile (the caller reuses the session key otherwise).
      await _vault.write(_keyName, hex.encode(session.key));
      await _vault.write(_blobName, blob);
    } catch (_) {
      throw const ProfileException(ProfileFailure.storageFailed);
    }
  }

  Uint8List _randomBytes(int n) => Uint8List.fromList(List<int>.generate(n, (_) => _random.nextInt(256)));
}

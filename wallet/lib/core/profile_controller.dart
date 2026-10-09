// The open profile for the foreground session (W-16, W-17). Locked until the person passes the device check, dropped
// again when the app goes to the background. Edits are saved at once, on the phone only.

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data_categories.dart';
import 'preferences.dart';
import 'profile.dart';
import 'profile_store.dart';
import 'wallet_providers.dart';

enum ProfileStage { locked, unlocked, lost }

class ProfileState {
  const ProfileState({this.stage = ProfileStage.locked, this.doc = const ProfileDoc(), this.failure, this.stale = const {}, this.hashes = const {}});

  final ProfileStage stage;
  final ProfileDoc doc;

  /// Why the last unlock failed, for the screen to word.
  final ProfileFailure? failure;

  /// `fiduciary|purposeCode` of shares whose sent fields changed. Kept outside the encrypted document so the marker of
  /// W5 and W1 shows without opening the profile: it holds company and purpose codes only, never a value.
  final Set<String> stale;

  /// Ciphertext hash of the copy the Processor holds, by `fiduciary|purposeCode` (W-18). A hash is not a value, and
  /// the Activity detail shows it without opening the profile.
  final Map<String, String> hashes;

  bool get isUnlocked => stage == ProfileStage.unlocked;
}

const _staleKey = 'stale_shares';
const _hashesKey = 'share_hashes';

Map<String, String> _readHashes(String? raw) {
  if (raw == null) return const {};
  try {
    return (jsonDecode(raw) as Map<String, dynamic>).cast<String, String>();
  } catch (_) {
    return const {};
  }
}

String shareKey(String fiduciary, String purposeCode) => '${fiduciary.toLowerCase()}|$purposeCode';

final profileStoreProvider = Provider<ProfileStore>((ref) {
  final wallet = ref.watch(walletServiceProvider);
  return ProfileStore(vault: wallet.vault, presence: wallet.presence);
});

class ProfileController extends Notifier<ProfileState> {
  ProfileSession? _session;

  @override
  ProfileState build() {
    final prefs = ref.read(sharedPreferencesProvider);
    return ProfileState(stale: (prefs.getStringList(_staleKey) ?? const []).toSet(), hashes: _readHashes(prefs.getString(_hashesKey)));
  }

  /// Asks for the device check and opens the profile. True when it is open afterwards.
  Future<bool> unlock({required String reason}) async {
    if (state.isUnlocked) return true;
    try {
      _session = await ref.read(profileStoreProvider).open(reason: reason);
      state = _with(ProfileStage.unlocked, _session!.doc);
      return true;
    } on ProfileException catch (e) {
      _session = null;
      state = ProfileState(stage: e.failure == ProfileFailure.lost ? ProfileStage.lost : ProfileStage.locked, failure: e.failure, stale: state.stale, hashes: state.hashes);
      return false;
    }
  }

  /// Account setup: starts the profile without a second prompt (the person has just passed the check).
  Future<void> start(Map<String, String> fields) async {
    final doc = const ProfileDoc().withFields(fields);
    _session = await ref.read(profileStoreProvider).create(doc);
    state = _with(ProfileStage.unlocked, doc);
  }

  /// After the blob was found unreadable: begin again with an empty profile (a new key; the old blob is overwritten).
  Future<void> startOver() async {
    _session = await ref.read(profileStoreProvider).create(const ProfileDoc());
    state = _with(ProfileStage.unlocked, const ProfileDoc());
  }

  /// Sets (or, for an empty string, removes) fields. Every share that carried a changed field becomes stale.
  Future<void> setFields(Map<String, String?> changes) => _commit((d) => d.withFields(changes));

  Future<void> recordShare(ShareRecord record) => _commit((d) => d.withShare(record));

  Future<void> dropShare(String fiduciary, String purposeCode) => _commit((d) => d.withoutShare(fiduciary, purposeCode));

  Future<void> _commit(ProfileDoc Function(ProfileDoc) change) async {
    final session = _session;
    if (session == null || !state.isUnlocked) throw const ProfileException(ProfileFailure.locked);
    final next = ProfileSession(session.key, change(session.doc));
    await ref.read(profileStoreProvider).save(next);
    _session = next;
    state = _with(ProfileStage.unlocked, next.doc);
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setStringList(_staleKey, state.stale.toList());
    await prefs.setString(_hashesKey, jsonEncode(state.hashes));
  }

  ProfileState _with(ProfileStage stage, ProfileDoc doc) => ProfileState(
        stage: stage,
        doc: doc,
        hashes: {...state.hashes, for (final s in doc.shares) if (s.ciphertextHash != null) shareKey(s.fiduciary, s.purposeCode): s.ciphertextHash!},
        stale: {...state.stale.where((k) => !doc.shares.any((s) => shareKey(s.fiduciary, s.purposeCode) == k)), for (final s in doc.shares) if (s.stale) shareKey(s.fiduciary, s.purposeCode)},
      );

  /// Forgets the decrypted profile and the key. Called when the app goes to the background.
  void lock() {
    _session = null;
    if (state.stage != ProfileStage.locked) state = ProfileState(stale: state.stale, hashes: state.hashes);
  }
}

final profileProvider = NotifierProvider<ProfileController, ProfileState>(ProfileController.new);

/// Shares whose sent fields changed and whose consent the caller says is still active: what W5 and W1 mark (W-17).
bool shareIsStale(ProfileState profile, String fiduciary, String purposeCode) => profile.stale.contains(shareKey(fiduciary, purposeCode));

/// The fields a consent's categories need that the profile lacks (W-13).
List<String> neededMissing(ProfileState profile, Iterable<String> categories) => missingFields(profile.doc.fields, categories);

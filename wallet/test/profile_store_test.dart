// The profile vault (W-16): ciphertext at rest, a key released only after the device check, and a damaged blob is
// lost rather than half-shown. Plus the stale-share rule of W-17.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/profile.dart';
import 'package:sammati/core/profile_store.dart';

import 'support/fakes.dart';

const _doc = {'fullName': 'Zebulon Quillfeather', 'pan': 'QZXWV9876K'};

void main() {
  late FakeVault vault;
  late FakePresence presence;
  late ProfileStore store;

  setUp(() {
    vault = FakeVault();
    presence = FakePresence();
    store = ProfileStore(vault: vault, presence: presence);
  });

  test('what is stored is ciphertext: no value is readable in the vault, and no prompt was needed to start', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    expect(presence.prompts, isEmpty);
    expect(vault.data.keys, containsAll(['profile_key', 'profile_blob']));
    final stored = vault.data.values.join('|');
    for (final secret in _doc.values) {
      expect(stored.contains(secret), isFalse);
      expect(utf8.decode(base64.decode(vault.data['profile_blob']!), allowMalformed: true).contains(secret), isFalse);
    }
  });

  test('reopening (a new app start) needs the device check and gives the same profile back', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    final again = ProfileStore(vault: vault, presence: presence); // the app was killed: only the secure storage remains
    expect(await again.exists(), isTrue);
    final session = await again.open(reason: 'open');
    expect(presence.prompts, ['open']);
    expect(session.doc.fields, _doc);
  });

  test('the key is not read when the person does not pass the check', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    vault.reads.clear();
    presence.approve = false;
    await expectLater(store.open(reason: 'open'), throwsA(isA<ProfileException>().having((e) => e.failure, 'failure', ProfileFailure.locked)));
    expect(vault.reads, isNot(contains('profile_key')));
  });

  test('a phone with no lock cannot open it', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    presence.available = false;
    await expectLater(store.open(reason: 'open'), throwsA(isA<ProfileException>()));
  });

  test('a damaged blob is lost, never half shown', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    final raw = base64.decode(vault.data['profile_blob']!);
    raw[raw.length ~/ 2] ^= 0xff;
    vault.data['profile_blob'] = base64.encode(raw);
    await expectLater(store.open(reason: 'open'), throwsA(isA<ProfileException>().having((e) => e.failure, 'failure', ProfileFailure.lost)));
  });

  test('a missing key with a blob is lost too', () async {
    await store.create(const ProfileDoc().withFields(_doc));
    vault.data.remove('profile_key');
    await expectLater(store.open(reason: 'open'), throwsA(isA<ProfileException>().having((e) => e.failure, 'failure', ProfileFailure.lost)));
  });

  test('every save uses a fresh nonce', () async {
    final session = await store.create(const ProfileDoc().withFields(_doc));
    final first = vault.data['profile_blob'];
    await store.save(session);
    expect(vault.data['profile_blob'], isNot(first));
  });

  test('nothing stored means an empty profile on open', () async {
    final session = await store.open(reason: 'open');
    expect(session.doc.isEmpty, isTrue);
  });

  group('shares go stale only when a sent field really changes (W-17)', () {
    final shared = const ProfileDoc().withFields({'pan': 'QZXWV9876K', 'fullName': 'Zebulon Quillfeather'}).withShare(
          const ShareRecord(fiduciary: '0xAbC', purposeCode: 'credit_check', fields: ['pan'], handle: '0x1', sentAt: 1),
        );

    test('editing a sent field marks it', () {
      expect(shared.withFields({'pan': 'ABCDE1234F'}).shares.single.stale, isTrue);
    });

    test('editing a field that was not sent does not', () {
      expect(shared.withFields({'fullName': 'Z Q'}).shares.single.stale, isFalse);
    });

    test('saving the same value again does not', () {
      expect(shared.withFields({'pan': 'QZXWV9876K'}).shares.single.stale, isFalse);
    });

    test('removing a sent field marks it, and sending again clears the mark', () {
      final stale = shared.withFields({'pan': ''});
      expect(stale.shares.single.stale, isTrue);
      final resent = stale.withShare(const ShareRecord(fiduciary: '0xabc', purposeCode: 'credit_check', fields: ['pan'], handle: '0x2', sentAt: 2));
      expect(resent.shares, hasLength(1));
      expect(resent.shares.single.stale, isFalse);
    });

    test('a field the registry does not know is dropped when a document is read', () {
      final doc = ProfileDoc.fromJson({'v': 1, 'fields': {'pan': 'QZXWV9876K', 'nickname': 'Zeb'}, 'shares': []});
      expect(doc.fields.keys, ['pan']);
    });
  });
}

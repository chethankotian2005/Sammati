import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// These break only in a release build on a phone, never in `flutter test`, so pin them here.
void main() {
  final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

  test('release manifest can reach Core: INTERNET permission', () {
    // The debug and profile manifests add it by themselves; the main one must too.
    expect(manifest, contains('android.permission.INTERNET'));
  });

  test('release manifest allows plain HTTP to the LAN Core (disclosed demo shortcut, trd.md §12)', () {
    expect(manifest, contains('android:usesCleartextTraffic="true"'));
  });

  test('biometric prompt permission is declared', () {
    expect(manifest, contains('android.permission.USE_BIOMETRIC'));
  });

  test('local_auth needs a FragmentActivity', () {
    final activity = File('android/app/src/main/kotlin/com/sammati/sammati/MainActivity.kt').readAsStringSync();
    expect(activity, contains('FlutterFragmentActivity'));
  });
}

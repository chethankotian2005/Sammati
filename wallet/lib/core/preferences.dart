// Device preferences (language, Core URL). Held in SharedPreferences, never
// anything secret: the wallet key lives in secure storage (trd.md §4.2).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const supportedLanguageCodes = ['en', 'hi', 'kn'];

const _localeKey = 'locale';
const _coreUrlKey = 'core_url';

// Build-time default (trd.md §5); 10.0.2.2 is the host machine from the Android emulator.
const defaultCoreUrl = String.fromEnvironment('CORE_URL', defaultValue: 'http://10.0.2.2:4000');

/// Overridden in main() with the instance loaded before runApp.
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError());

class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() {
    final saved = ref.watch(sharedPreferencesProvider).getString(_localeKey);
    return Locale(supportedLanguageCodes.contains(saved) ? saved! : 'en');
  }

  Future<void> setLanguage(String code) async {
    assert(supportedLanguageCodes.contains(code));
    state = Locale(code);
    await ref.read(sharedPreferencesProvider).setString(_localeKey, code);
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(LocaleNotifier.new);

/// Accepts only absolute http(s) URLs, so a typo cannot silently break every request.
bool isValidCoreUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  // `http://` parses with an authority but an empty host, so check the host itself.
  return uri != null && uri.host.isNotEmpty && (uri.scheme == 'http' || uri.scheme == 'https');
}

class CoreUrlNotifier extends Notifier<String> {
  @override
  String build() => ref.watch(sharedPreferencesProvider).getString(_coreUrlKey) ?? defaultCoreUrl;

  Future<void> set(String value) async {
    assert(isValidCoreUrl(value));
    final normalized = value.trim().replaceAll(RegExp(r'/+$'), '');
    state = normalized;
    await ref.read(sharedPreferencesProvider).setString(_coreUrlKey, normalized);
  }
}

final coreUrlProvider = NotifierProvider<CoreUrlNotifier, String>(CoreUrlNotifier.new);

/// Whether account creation (W-15) has finished on this phone. Not secret. A wallet made before accounts existed has no
/// flag and is taken through the profile step once, which it can skip.
class AccountSetupNotifier extends Notifier<bool> {
  @override
  bool build() => ref.watch(sharedPreferencesProvider).getBool(_setupKey) ?? false;

  Future<void> finish() async {
    state = true;
    await ref.read(sharedPreferencesProvider).setBool(_setupKey, true);
  }
}

const _setupKey = 'account_setup_done';

final accountSetupDoneProvider = NotifierProvider<AccountSetupNotifier, bool>(AccountSetupNotifier.new);

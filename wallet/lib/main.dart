import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'core/consent_providers.dart';
import 'core/preferences.dart';
import 'core/profile_controller.dart';
import 'features/scan/camera_scanner_view.dart';
import 'features/scan/web_scanner_view.dart';
import 'l10n/generated/app_localizations.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      scannerViewBuilderProvider.overrideWithValue(
        (context, onCode) => kIsWeb ? WebScannerView(onCode: onCode) : CameraScannerView(onCode: onCode),
      ),
    ],
    child: const SammatiApp(),
  ));
}

class SammatiApp extends ConsumerStatefulWidget {
  const SammatiApp({super.key});

  @override
  ConsumerState<SammatiApp> createState() => _SammatiAppState();
}

class _SammatiAppState extends ConsumerState<SammatiApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // The decrypted profile and its key are dropped when the app leaves the foreground (W-16): the next view asks again.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) ref.read(profileProvider.notifier).lock();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      theme: buildSammatiTheme(),
      locale: ref.watch(localeProvider),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      routerConfig: ref.watch(routerProvider),
    );
  }
}

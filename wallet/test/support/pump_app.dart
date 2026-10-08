import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/activity_controller.dart';
import 'package:sammati/core/consent_providers.dart';
import 'package:sammati/core/consents_controller.dart';
import 'package:sammati/core/notifications.dart';
import 'package:sammati/core/processor_api.dart';
import 'package:sammati/core/preferences.dart';
import 'package:sammati/core/wallet_providers.dart';
import 'package:sammati/core/wallet_service.dart';
import 'package:sammati/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_core.dart';
import 'fakes.dart';

/// Two buttons that stand in for the camera: one "reads" a valid console QR, one reads junk.
Widget fakeScannerView(BuildContext context, ValueChanged<String> onCode) => Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        TextButton(onPressed: () => onCode(qrJson()), child: const Text('read valid qr')),
        TextButton(onPressed: () => onCode('{"hello":"world"}'), child: const Text('read other json')),
        TextButton(onPressed: () => onCode('not json at all'), child: const Text('read junk')),
      ],
    );

// 2025-10-09, so signature deadlines in the fixtures are in a fixed place.
DateTime fixedNow() => DateTime.fromMillisecondsSinceEpoch(1760000000 * 1000, isUtc: true);

/// Pumps the app on a phone that already has a wallet unless [withWallet] is false.
Future<FakeCoreApi> pumpApp(
  WidgetTester tester, {
  Map<String, Object> stored = const {},
  bool withWallet = true,
  FakePresence? presence,
  FakeCoreApi? core,
  FakeLiveEvents? live,
  Stream<DateTime>? ticks,
  ProcessorApi? processor,
  LocalNotifier? notifier,
}) async {
  SharedPreferences.setMockInitialValues(stored);
  final prefs = await SharedPreferences.getInstance();
  final fakePresence = presence ?? FakePresence();
  final fakeCore = core ?? FakeCoreApi();
  final fakeLive = live ?? FakeLiveEvents();
  final service = WalletService(vault: FakeVault(), presence: fakePresence);
  if (withWallet) {
    // The wallet exists before the scenario starts, even if the scenario is "user declines biometrics".
    final scenarioApproves = fakePresence.approve;
    fakePresence.approve = true;
    await service.create(reason: 'setup');
    fakePresence.approve = scenarioApproves;
    fakePresence.prompts.clear();
  }
  await tester.pumpWidget(ProviderScope(
    overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      walletServiceProvider.overrideWithValue(service),
      scannerViewBuilderProvider.overrideWithValue(fakeScannerView),
      coreApiFactoryProvider.overrideWithValue((_) => fakeCore),
      liveEventsFactoryProvider.overrideWithValue((_, _) => fakeLive),
      processorApiFactoryProvider.overrideWithValue((_) => processor ?? FakeProcessorApi()),
      clockProvider.overrideWithValue(fixedNow),
      // Nothing is raised on a phone from a test unless the test brings a recorder.
      localNotifierProvider.overrideWithValue(notifier ?? const NoopNotifier()),
      // A real 1 s timer would keep pumpAndSettle from ever settling.
      clockTickProvider.overrideWith((ref) => ticks ?? const Stream<DateTime>.empty()),
    ],
    child: const SammatiApp(),
  ));
  // pumpAndSettle ignores a pending timer when no frame is scheduled, so run out the splash explicitly.
  await tester.pump(splashDuration);
  await tester.pumpAndSettle();
  return fakeCore;
}

/// A tall screen so a whole notice is on screen without scrolling.
void useTallScreen(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

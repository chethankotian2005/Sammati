import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/core_api.dart';
import '../core/wallet_providers.dart';
import '../features/activity/activity_screen.dart';
import '../features/alerts/alerts_screen.dart';
import '../features/consent/notice_screen.dart';
import '../features/consent/receipt_data.dart';
import '../features/consent/receipt_screen.dart';
import '../features/consents/consents_screen.dart';
import '../features/consents/pass_detail_screen.dart';
import '../features/me/dev_settings_screen.dart';
import '../features/me/me_screen.dart';
import '../features/onboarding/create_wallet_screen.dart';
import '../features/onboarding/language_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/onboarding/splash_screen.dart';
import '../features/rights/rights_screen.dart';
import '../features/requests/requests_screen.dart';
import '../features/requests/sammati_id_screen.dart';
import '../features/vault/demo_profile_screen.dart';
import '../features/vault/share_details_screen.dart';
import '../features/scan/scan_screen.dart';
import '../features/shell/home_shell.dart';

abstract final class Routes {
  static const splash = '/splash';
  static const language = '/language';
  static const onboarding = '/onboarding';
  static const createWallet = '/create-wallet';
  static const consents = '/consents';
  static const activity = '/activity';
  static const alerts = '/alerts';
  static const rights = '/rights';
  static const me = '/me';
  static const devSettings = '/dev-settings';
  static const demoProfile = '/demo-profile';
  static const requests = '/requests';
  static const sammatiId = '/sammati-id';
  static const share = '/share/:fiduciary/:purpose';
  static String shareFor(String fiduciary, String purposeCode) => '/share/$fiduciary/$purposeCode';
  static const scan = '/scan';
  static const pass = '/pass/:fiduciary';
  static String passFor(String fiduciary) => '/pass/$fiduciary';
  static const consentNotice = '/consent';
  static const receipt = '/receipt';

  static const _setup = {language, onboarding, createWallet};
}

/// Sends the user to setup until a wallet exists, and keeps them out of it afterwards.
String? walletRedirect({required AsyncValue<String?> wallet, required String location}) {
  if (wallet.isLoading) return location == Routes.splash ? null : Routes.splash;

  final hasWallet = wallet.value != null;
  final inSetup = Routes._setup.contains(location);
  if (location == Routes.splash) return hasWallet ? Routes.consents : Routes.language;
  if (!hasWallet && !inSetup) return Routes.language;
  if (hasWallet && inSetup) return Routes.consents;
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  // Re-run the redirect whenever the wallet state changes (e.g. right after creation).
  final refresh = ValueNotifier<int>(0);
  ref.listen(walletAddressProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (_, state) => walletRedirect(
      wallet: ref.read(walletAddressProvider),
      location: state.matchedLocation,
    ),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.language, builder: (_, _) => const LanguageScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, _) => const OnboardingScreen()),
      GoRoute(path: Routes.createWallet, builder: (_, _) => const CreateWalletScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: Routes.consents, builder: (_, _) => const ConsentsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.activity, builder: (_, _) => const ActivityScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.alerts, builder: (_, _) => const AlertsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.rights, builder: (_, _) => const RightsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: Routes.me, builder: (_, _) => const MeScreen())]),
        ],
      ),
      // Outside the shell: the scanner is full screen (ui.md W2) and dev settings is a pushed detail.
      GoRoute(path: Routes.scan, builder: (_, _) => const ScanScreen()),
      // These carry their data in `extra`; after a process restart it is gone, so fall back to home.
      GoRoute(
        path: Routes.consentNotice,
        redirect: (_, state) => state.extra is QrPayload ? null : Routes.consents,
        builder: (_, state) => NoticeScreen(payload: state.extra! as QrPayload),
      ),
      GoRoute(
        path: Routes.receipt,
        redirect: (_, state) => state.extra is ReceiptData ? null : Routes.consents,
        builder: (_, state) => ReceiptScreen(receipt: state.extra! as ReceiptData),
      ),
      GoRoute(path: Routes.pass, builder: (_, state) => PassDetailScreen(fiduciary: state.pathParameters['fiduciary']!)),
      GoRoute(path: Routes.devSettings, builder: (_, _) => const DevSettingsScreen()),
      GoRoute(path: Routes.demoProfile, builder: (_, _) => const DemoProfileScreen()),
      GoRoute(path: Routes.requests, builder: (_, _) => const RequestsScreen()),
      GoRoute(path: Routes.sammatiId, builder: (_, _) => const SammatiIdScreen()),
      GoRoute(
        path: Routes.share,
        builder: (_, state) => ShareDetailsScreen(
          fiduciary: state.pathParameters['fiduciary']!,
          purposeCode: state.pathParameters['purpose']!,
          companyName: state.extra as String?,
        ),
      ),
    ],
  );
});

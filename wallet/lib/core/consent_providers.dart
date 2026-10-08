import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'consent_flow.dart';
import 'core_api.dart';
import 'notice.dart';
import 'wallet_providers.dart';

/// Builds a client for a Core base URL. Overridden in tests.
final coreApiFactoryProvider = Provider<CoreApi Function(String baseUrl)>((ref) => DioCoreApi.new);

final clockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

final consentFlowProvider = Provider<ConsentFlow>((ref) => ConsentFlow(
      wallet: ref.watch(walletServiceProvider),
      apiFor: ref.watch(coreApiFactoryProvider),
      clock: ref.watch(clockProvider),
    ));

/// The verified notice for a scanned QR code. Errors carry CoreException,
/// NoticeRejectedException or WalletException for the screen to explain.
final noticeProvider = FutureProvider.autoDispose.family<ConsentNotice, QrPayload>(
  (ref, payload) => ref.watch(consentFlowProvider).loadNotice(payload),
);

/// Builds the camera view, which calls [onCode] with each QR string it reads.
/// A provider so tests can replace the camera.
typedef ScannerViewBuilder = Widget Function(BuildContext context, ValueChanged<String> onCode);

final scannerViewBuilderProvider = Provider<ScannerViewBuilder>(
  (ref) => throw UnimplementedError('Overridden in main() with the camera view'),
);

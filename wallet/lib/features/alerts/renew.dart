import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/alerts_controller.dart';
import '../../core/core_api.dart';
import '../../core/preferences.dart';
import '../../l10n/generated/app_localizations.dart';

/// Renew (N-04): asks Core for the open renewal request for this consent, then opens the ordinary consent notice for
/// it (W3, with the expiry choices). Everything after that is W3 and W4: the grant is the customer's own signature.
Future<void> startRenewal(BuildContext context, WidgetRef ref, {required String fiduciary, required String company, required String purposeCode}) async {
  final t = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  final requestId = await ref.read(alertsProvider.notifier).renewalFor(fiduciary: fiduciary, purposeCode: purposeCode);
  if (requestId == null) {
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(t.alert_renew_failed)));
    return;
  }
  router.push(Routes.consentNotice, extra: QrPayload(core: ref.read(coreUrlProvider), requestId: requestId, fiduciary: fiduciary, name: company));
}

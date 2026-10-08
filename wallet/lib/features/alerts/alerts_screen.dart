import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/alerts.dart';
import '../../core/alerts_controller.dart';
import '../../core/consent_providers.dart';
import '../../core/consents_controller.dart';
import '../../core/notice.dart' show LocalizedText;
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../consent/proof_sheet.dart';
import '../consent/receipt_data.dart';
import '../shell/empty_state.dart';
import '../shell/offline_banner.dart';
import 'renew.dart';

/// W13 Alerts (N-05, W-11): expiry reminders, a company's renewal request, "your data was erased" and a processor's
/// confirmation, newest first under Today and Earlier, each with the actions that make sense for it.
class AlertsScreen extends ConsumerWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final state = ref.watch(alertsProvider);
    final now = ref.watch(clockProvider)();

    final today = [for (final a in state.items) if (_sameDay(a.createdAt, now)) a];
    final earlier = [for (final a in state.items) if (!_sameDay(a.createdAt, now)) a];

    return Scaffold(
      appBar: AppBar(
        title: Text(t.alerts_title),
        actions: [
          if (state.unread > 0)
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: SammatiColors.surface),
              onPressed: () => ref.read(alertsProvider.notifier).markAllRead(),
              child: Text(t.alerts_mark_all),
            ),
        ],
      ),
      body: Column(
        children: [
          if (state.fetchFailed && state.loaded) OfflineBanner(message: t.alerts_offline),
          Expanded(
            child: !state.loaded && state.loading
                ? const Center(child: CircularProgressIndicator())
                : !state.loaded && state.fetchFailed
                    ? EmptyState(
                        icon: Icons.wifi_off,
                        message: t.error_unreachable,
                        action: FilledButton(onPressed: ref.read(alertsProvider.notifier).refresh, child: Text(t.retry)),
                      )
                    : state.items.isEmpty
                        ? EmptyState(icon: Icons.notifications_none, message: t.alerts_empty)
                        : RefreshIndicator(
                            onRefresh: ref.read(alertsProvider.notifier).refresh,
                            child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                                if (today.isNotEmpty) _Header(t.alerts_today),
                                for (final a in today) ...[AlertCard(item: a, fresh: state.fresh.contains(a.id)), const SizedBox(height: 12)],
                                if (earlier.isNotEmpty) _Header(t.alerts_earlier),
                                for (final a in earlier) ...[AlertCard(item: a, fresh: state.fresh.contains(a.id)), const SizedBox(height: 12)],
                              ],
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  static bool _sameDay(int seconds, DateTime now) {
    final d = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
    return d.year == now.year && d.month == now.month && d.day == now.day;
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
        header: true,
        child: Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Text(text, style: Theme.of(context).textTheme.titleMedium),
        ),
      );
}

IconData _iconFor(AlertType type) => switch (type) {
      AlertType.expiring => Icons.schedule,
      AlertType.expired => Icons.event_busy,
      AlertType.renewalRequested => Icons.autorenew,
      AlertType.dataErased => Icons.delete_outline,
      AlertType.cascadeAcknowledged => Icons.done_all,
    };

/// "2 min ago", from what Core stamped: the largest unit, in the customer's language.
String agoText(AppLocalizations t, int createdAt, DateTime now) {
  final seconds = now.millisecondsSinceEpoch ~/ 1000 - createdAt;
  return t.alert_ago(durationText(t, seconds < 0 ? 0 : seconds));
}

class AlertCard extends ConsumerWidget {
  const AlertCard({super.key, required this.item, required this.fresh});

  final AlertItem item;

  /// Arrived live a moment ago: it washes in from `marigold` (ui.md W13). Reduced motion shows it already settled.
  final bool fresh;

  /// The consent this alert is about, as the wallet knows it: its title in the customer's language and the transaction behind it.
  ConsentViewRef? _consent(WidgetRef ref) {
    final company = ref.read(consentsProvider).snapshot?.company(item.fiduciary);
    final match = company?.consents.where((c) => c.purposeId.toLowerCase() == (item.purposeId ?? '').toLowerCase()).firstOrNull;
    return match == null ? null : ConsentViewRef(match.title, match.lastTx);
  }

  Future<void> _renew(BuildContext context, WidgetRef ref) async {
    unawaited(ref.read(alertsProvider.notifier).markRead(item));
    await startRenewal(context, ref, fiduciary: item.fiduciary, company: item.company, purposeCode: item.purposeCode!);
  }

  Future<void> _letExpire(BuildContext context, WidgetRef ref) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    await ref.read(alertsProvider.notifier).record(item, AlertAction.letExpire);
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(t.alert_let_expire_done)));
  }

  Future<void> _proof(BuildContext context, WidgetRef ref, String txHash) async {
    await ref.read(alertsProvider.notifier).record(item, AlertAction.viewedProof);
    if (context.mounted) await showConsentProofSheet(context, txHash);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final language = Localizations.localeOf(context).languageCode;
    final now = ref.watch(clockProvider)();
    final accent = parseCompanyColor(item.color, SammatiColors.ink);
    final calm = MediaQuery.disableAnimationsOf(context);
    final consent = _consent(ref);
    final purpose = consent?.title.forLanguage(language) ?? item.purposeCode ?? '';
    final tx = consent?.lastTx;
    final answered = switch (item.actionTaken) {
      AlertAction.renewed => t.alert_state_renewed,
      AlertAction.letExpire => t.alert_state_left,
      _ => null,
    };

    final card = Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        border: Border.all(color: SammatiColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Unread is the dot, the bold sentence and the word for a screen reader: never colour alone.
              if (item.unread) ...[
                Semantics(
                  label: t.alerts_unread,
                  child: Container(key: ValueKey('unread-${item.id}'), width: 10, height: 10, decoration: const BoxDecoration(color: SammatiColors.marigold, shape: BoxShape.circle)),
                ),
                const SizedBox(width: 8),
              ],
              Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: accent)),
              const SizedBox(width: 8),
              Expanded(child: Text(item.company, style: style.titleMedium)),
              const SizedBox(width: 8),
              Text(agoText(t, item.createdAt, now), style: style.bodySmall),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(_iconFor(item.type), size: 20, color: SammatiColors.mute),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  alertSentence(t, item, purpose),
                  style: style.bodyLarge?.copyWith(fontWeight: item.unread ? FontWeight.w800 : FontWeight.w500),
                ),
              ),
            ],
          ),
          if (item.message != null) ...[
            const SizedBox(height: 12),
            Text(t.inbox_message_from(item.company), style: style.bodySmall),
            const SizedBox(height: 2),
            Text(item.message!, style: style.bodyMedium),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (answered != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.check, size: 18, color: SammatiColors.allow),
                    const SizedBox(width: 6),
                    Text(answered, style: style.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                  ]),
                ),
              if (item.canRenew)
                FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(48, 48)), onPressed: () => _renew(context, ref), child: Text(t.alert_renew)),
              if (item.canLetExpire)
                TextButton(style: TextButton.styleFrom(minimumSize: const Size(48, 48)), onPressed: () => _letExpire(context, ref), child: Text(t.alert_let_expire)),
              if (tx != null)
                TextButton(style: TextButton.styleFrom(minimumSize: const Size(48, 48)), onPressed: () => _proof(context, ref, tx), child: Text(t.alert_view_proof)),
            ],
          ),
        ],
      ),
    );

    // Tapping anywhere on it reads it; the wash plays for an alert that arrived live.
    final tappable = InkWell(
      borderRadius: BorderRadius.circular(SammatiRadius.row),
      onTap: () {
        ref.read(alertsProvider.notifier).markRead(item);
        ref.read(alertsProvider.notifier).settle(item.id);
      },
      child: card,
    );
    return TweenAnimationBuilder<Color?>(
      key: ValueKey('${item.id}-${fresh && !calm}'),
      tween: ColorTween(begin: fresh && !calm ? SammatiColors.marigold.withValues(alpha: 0.35) : (item.unread ? SammatiColors.surface : SammatiColors.paper), end: item.unread ? SammatiColors.surface : SammatiColors.paper),
      duration: fresh && !calm ? const Duration(milliseconds: 1200) : Duration.zero,
      builder: (_, color, child) => DecoratedBox(
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(SammatiRadius.row)),
        child: child,
      ),
      child: tappable,
    );
  }
}

/// The two things about a consent this screen needs, so it does not hold the whole view.
class ConsentViewRef {
  const ConsentViewRef(this.title, this.lastTx);
  final LocalizedText title;
  final String? lastTx;
}

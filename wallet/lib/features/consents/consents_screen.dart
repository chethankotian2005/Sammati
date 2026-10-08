import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/consent_providers.dart';
import '../../core/consents.dart';
import '../../core/consents_controller.dart';
import '../../core/requests_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../consent/receipt_data.dart';
import '../shell/empty_state.dart';
import '../shell/offline_banner.dart';
import 'consent_text.dart';

/// W1 home: one pass per company, each purpose with its live status.
class ConsentsScreen extends ConsumerWidget {
  const ConsentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final state = ref.watch(consentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(t.appName),
        actions: [
          // W11: the inbox, with the number of requests waiting. Read by screen readers as "3 requests".
          Builder(builder: (context) {
            final waiting = ref.watch(requestsProvider).items.length;
            return Semantics(
              label: t.inbox_badge_label(waiting),
              button: true,
              child: IconButton(
                tooltip: t.inbox_title,
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                onPressed: () => context.push(Routes.requests),
                icon: Badge(
                  isLabelVisible: waiting > 0,
                  label: Text('$waiting'),
                  backgroundColor: SammatiColors.marigold,
                  textColor: SammatiColors.ink,
                  child: const Icon(Icons.notifications_none),
                ),
              ),
            );
          }),
        ],
      ),
      body: Column(
        children: [
          if (state.offline && state.snapshot != null) OfflineBanner(message: t.offline_banner),
          Expanded(child: _Content(state: state)),
        ],
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.state});

  final ConsentsState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final snapshot = state.snapshot;

    if (snapshot == null) {
      if (state.loading) return const Center(child: CircularProgressIndicator());
      if (state.fetchFailed) {
        return EmptyState(
          icon: Icons.wifi_off,
          message: t.error_unreachable,
          action: FilledButton(onPressed: ref.read(consentsProvider.notifier).refresh, child: Text(t.retry)),
        );
      }
      return EmptyState(icon: Icons.verified_user_outlined, message: t.consents_empty);
    }
    if (snapshot.companies.isEmpty) {
      return EmptyState(icon: Icons.verified_user_outlined, message: t.consents_empty);
    }

    final now = ref.watch(clockProvider)();
    return RefreshIndicator(
      onRefresh: ref.read(consentsProvider.notifier).refresh,
      child: ListView(
        // Room under the last pass for the docked scan button.
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
        children: [
          Text(
            t.consents_summary(snapshot.companies.length, snapshot.activeCount(now)),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          for (final company in snapshot.companies) ...[
            _PassCard(company: company, now: now),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }
}

class _PassCard extends StatelessWidget {
  const _PassCard({required this.company, required this.now});

  final CompanyConsents company;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final style = Theme.of(context).textTheme;
    final accent = parseCompanyColor(company.fiduciary.color, SammatiColors.ink);
    final expiry = passExpiryLine(t, company, now);

    return Material(
      color: SammatiColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SammatiRadius.pass),
        side: const BorderSide(color: SammatiColors.line),
      ),
      child: InkWell(
        onTap: () => context.push(Routes.passFor(company.fiduciary.address)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              color: accent,
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(company.fiduciary.name, style: style.titleLarge?.copyWith(color: SammatiColors.surface)),
                        if (company.fiduciary.sector != null)
                          Text(company.fiduciary.sector!, style: style.bodyMedium?.copyWith(color: SammatiColors.surface)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: SammatiColors.surface),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Column(
                children: [
                  for (final consent in company.consents)
                    ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: Row(
                        children: [
                          Expanded(child: Text(consent.title.forLanguage(language), style: style.bodyLarge)),
                          const SizedBox(width: 8),
                          StatusChip(state: consent.stateAt(now)),
                        ],
                      ),
                    ),
                  if (expiry != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, bottom: 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(expiry, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

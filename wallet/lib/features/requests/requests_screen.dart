import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/consent_providers.dart';
import '../../core/core_api.dart';
import '../../core/preferences.dart';
import '../../core/requests.dart';
import '../../core/requests_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../consent/receipt_data.dart';
import '../shell/empty_state.dart';
import '../shell/offline_banner.dart';

/// W11 requests inbox (W-14): what companies have asked this customer for, with Review, Decline and Block.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final state = ref.watch(requestsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(t.inbox_title)),
      body: Column(
        children: [
          if (state.fetchFailed && state.loaded) OfflineBanner(message: t.inbox_offline),
          Expanded(
            child: !state.loaded && state.loading
                ? const Center(child: CircularProgressIndicator())
                : !state.loaded && state.fetchFailed
                    ? EmptyState(
                        icon: Icons.wifi_off,
                        message: t.error_unreachable,
                        action: FilledButton(onPressed: ref.read(requestsProvider.notifier).refresh, child: Text(t.retry)),
                      )
                    : state.items.isEmpty
                        ? EmptyState(icon: Icons.inbox_outlined, message: t.inbox_empty)
                        : RefreshIndicator(
                            onRefresh: ref.read(requestsProvider.notifier).refresh,
                            child: ListView(
                              padding: const EdgeInsets.all(16),
                              children: [
                                for (final item in state.items) ...[
                                  RequestCard(item: item, fresh: state.fresh.contains(item.requestId)),
                                  const SizedBox(height: 12),
                                ],
                              ],
                            ),
                          ),
          ),
          SafeArea(
            top: false,
            child: TextButton.icon(
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: () => showBlockedCompanies(context),
              icon: const Icon(Icons.block),
              label: Text(t.blocked_title),
            ),
          ),
        ],
      ),
    );
  }
}

String expiryText(AppLocalizations t, int expiresAt, DateTime now) {
  final seconds = expiresAt - now.millisecondsSinceEpoch ~/ 1000;
  if (seconds < 3600) return t.inbox_expires_soon;
  return t.inbox_expires_hours((seconds / 3600).ceil());
}

class RequestCard extends ConsumerWidget {
  const RequestCard({super.key, required this.item, required this.fresh});

  final InboxRequest item;

  /// Arrived live a moment ago: it washes in from `marigold` (ui.md W11). Reduced motion shows it already settled.
  final bool fresh;

  Future<void> _decline(BuildContext context, WidgetRef ref) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await ref.read(requestsProvider.notifier).decline(item, reason: t.auth_reason_decline);
    _say(messenger, ref, t, ok ? t.request_declined : null);
  }

  Future<void> _block(BuildContext context, WidgetRef ref) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(SammatiRadius.pass))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(t.request_block_confirm(item.company), style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 24),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: SammatiColors.block, minimumSize: const Size.fromHeight(56)),
                onPressed: () => Navigator.of(context).pop(true),
                child: Text(t.request_block),
              ),
              const SizedBox(height: 8),
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                onPressed: () => Navigator.of(context).pop(false),
                child: Text(t.keep),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true) return;
    final ok = await ref.read(requestsProvider.notifier).block(item, reason: t.auth_reason_block);
    _say(messenger, ref, t, ok ? t.request_blocked(item.company) : null);
  }

  void _say(ScaffoldMessengerState messenger, WidgetRef ref, AppLocalizations t, String? success) {
    final text = success ??
        switch (ref.read(requestsProvider).problem) {
          RequestsProblem.authFailed => t.wallet_auth_failed,
          RequestsProblem.unreachable => t.error_unreachable,
          _ => t.error_generic,
        };
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  void _review(BuildContext context, WidgetRef ref) {
    ref.read(requestsProvider.notifier).settle(item.requestId);
    context.push(
      Routes.consentNotice,
      extra: QrPayload(core: ref.read(coreUrlProvider), requestId: item.requestId, fiduciary: item.fiduciary, name: item.company),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final language = Localizations.localeOf(context).languageCode;
    final now = ref.watch(clockProvider)();
    final accent = parseCompanyColor(item.color, SammatiColors.ink);
    final calm = MediaQuery.disableAnimationsOf(context);

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
              Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: accent)),
              const SizedBox(width: 8),
              Expanded(child: Text(item.company, style: style.titleLarge)),
            ],
          ),
          const SizedBox(height: 8),
          Text(t.inbox_asks(item.company, item.purposes.length), style: style.bodyLarge),
          const SizedBox(height: 4),
          Text(item.purposes.map((p) => p.title.forLanguage(language)).join(' · '), style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
          if (item.message != null) ...[
            const SizedBox(height: 12),
            Text(t.inbox_message_from(item.company), style: style.bodySmall),
            const SizedBox(height: 2),
            Text(item.message!, style: style.bodyMedium),
          ],
          const SizedBox(height: 12),
          Row(children: [
            const Icon(Icons.schedule, size: 18, color: SammatiColors.mute),
            const SizedBox(width: 6),
            Expanded(child: Text(expiryText(t, item.expiresAt, now), style: style.bodyMedium)),
          ]),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
                onPressed: () => _review(context, ref),
                child: Text(t.request_review),
              ),
              TextButton(style: TextButton.styleFrom(minimumSize: const Size(48, 48)), onPressed: () => _decline(context, ref), child: Text(t.request_decline)),
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: SammatiColors.block),
                onPressed: () => _block(context, ref),
                child: Text(t.request_block),
              ),
            ],
          ),
        ],
      ),
    );

    // A card that arrived live washes in from marigold to the surface colour over 1.2 s.
    return TweenAnimationBuilder<Color?>(
      key: ValueKey('${item.requestId}-${fresh && !calm}'),
      tween: ColorTween(begin: fresh && !calm ? SammatiColors.marigold.withValues(alpha: 0.35) : SammatiColors.surface, end: SammatiColors.surface),
      duration: fresh && !calm ? const Duration(milliseconds: 1200) : Duration.zero,
      builder: (_, color, child) => DecoratedBox(
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(SammatiRadius.row)),
        child: child,
      ),
      child: card,
    );
  }
}

/// The companies this customer blocked, each with Unblock.
Future<void> showBlockedCompanies(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(SammatiRadius.pass))),
    builder: (_) => const _BlockedSheet(),
  );
}

class _BlockedSheet extends ConsumerStatefulWidget {
  const _BlockedSheet();

  @override
  ConsumerState<_BlockedSheet> createState() => _BlockedSheetState();
}

class _BlockedSheetState extends ConsumerState<_BlockedSheet> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(blocksProvider.notifier).refresh());
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final blocked = ref.watch(blocksProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t.blocked_title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            if (blocked.isEmpty)
              Text(t.blocked_empty, style: Theme.of(context).textTheme.bodyLarge)
            else
              for (final c in blocked)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  minTileHeight: 56,
                  title: Text(c.name),
                  trailing: TextButton(
                    onPressed: () => ref.read(requestsProvider.notifier).unblock(c.fiduciary, reason: t.auth_reason_block),
                    child: Text(t.request_unblock),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

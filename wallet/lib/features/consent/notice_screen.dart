import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/consent_flow.dart';
import '../../core/consent_providers.dart';
import '../../core/core_api.dart';
import '../../core/notice.dart';
import '../../core/preferences.dart';
import '../../core/wallet_service.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import 'receipt_data.dart';

/// W3 consent notice. Everything shown here is what gets hashed and signed;
/// the notice is verified before this screen renders it.
class NoticeScreen extends ConsumerStatefulWidget {
  const NoticeScreen({super.key, required this.payload});

  final QrPayload payload;

  @override
  ConsumerState<NoticeScreen> createState() => _NoticeScreenState();
}

enum _SubmitError { authFailed, unreachable, mismatch, failed }

class _NoticeScreenState extends ConsumerState<NoticeScreen> {
  // Nothing is pre-ticked (prd.md W-03).
  final _selected = <String>{};
  final _expiry = <String, ConsentExpiry>{};
  // Purposes already on the ledger, kept across retries so they are never granted twice.
  final _recorded = <String, RecordedGrant>{};
  bool _submitting = false;
  _SubmitError? _error;

  ConsentExpiry _expiryOf(String id) => _expiry[id] ?? ConsentExpiry.months6;

  Future<void> _submit(ConsentNotice notice) async {
    final t = AppLocalizations.of(context);
    final choices = [
      for (final p in notice.purposes)
        if (_selected.contains(p.id) && !_recorded.containsKey(p.id)) PurposeChoice(p.id, _expiryOf(p.id)),
    ];
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final granted = await ref.read(consentFlowProvider).grant(
            payload: widget.payload,
            shown: notice,
            choices: choices,
            reason: t.auth_reason_sign,
          );
      for (final g in granted) {
        _recorded[g.purposeId] = g;
      }
      if (mounted) _showReceipt(notice);
    } on WalletException {
      _fail(_SubmitError.authFailed);
    } on NoticeRejectedException {
      _fail(_SubmitError.mismatch);
    } on GrantInterruptedException catch (e) {
      for (final g in e.recorded) {
        _recorded[g.purposeId] = g;
      }
      _fail(e.cause.failure == CoreFailure.unreachable ? _SubmitError.unreachable : _SubmitError.failed);
    } on CoreException catch (e) {
      _fail(e.failure == CoreFailure.unreachable ? _SubmitError.unreachable : _SubmitError.failed);
    }
  }

  void _fail(_SubmitError error) {
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _error = error;
    });
  }

  void _showReceipt(ConsentNotice notice) {
    final byId = {for (final p in notice.purposes) p.id: p};
    context.go(
      Routes.receipt,
      extra: ReceiptData(
        companyName: notice.fiduciary.name,
        companyColor: parseCompanyColor(notice.fiduciary.color, SammatiColors.ink),
        items: [
          for (final g in _recorded.values)
            ReceiptItem(title: byId[g.purposeId]!.title, txHash: g.txHash, expiresAt: g.expiresAt),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final notice = ref.watch(noticeProvider(widget.payload));
    return Scaffold(
      appBar: AppBar(title: Text(widget.payload.name)),
      body: notice.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _LoadError(
          error: error,
          onRetry: () => ref.invalidate(noticeProvider(widget.payload)),
        ),
        data: _buildNotice,
      ),
    );
  }

  Widget _buildNotice(ConsentNotice notice) {
    final t = AppLocalizations.of(context);
    final language = ref.watch(localeProvider).languageCode;
    final accent = parseCompanyColor(notice.fiduciary.color, SammatiColors.ink);
    final count = _selected.length - _recorded.keys.where(_selected.contains).length;
    final errorText = switch (_error) {
      null => null,
      _SubmitError.authFailed => t.wallet_auth_failed,
      _SubmitError.unreachable => t.error_unreachable,
      _SubmitError.mismatch => t.notice_mismatch,
      _SubmitError.failed => t.grant_failed,
    };

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _Header(notice: notice, accent: accent, purposeCount: notice.purposes.length),
              const SizedBox(height: 16),
              for (final p in notice.purposes) ...[
                _PurposeCard(
                  purpose: p,
                  company: notice.fiduciary.name,
                  language: language,
                  enabled: !_submitting && !_recorded.containsKey(p.id),
                  selected: _selected.contains(p.id),
                  expiry: _expiryOf(p.id),
                  onSelected: (on) => setState(() => on ? _selected.add(p.id) : _selected.remove(p.id)),
                  onExpiry: (e) => setState(() => _expiry[p.id] = e),
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
        _Footer(
          errorText: errorText,
          label: _error != null ? t.retry : (count > 0 ? t.give_consent_count(count) : t.give_consent),
          // A notice that failed verification cannot be retried: the QR code itself is untrustworthy.
          onPressed: (_submitting || count == 0 || _error == _SubmitError.mismatch) ? null : () => _submit(notice),
          busy: _submitting,
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.notice, required this.accent, required this.purposeCount});

  final ConsentNotice notice;
  final Color accent;
  final int purposeCount;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(SammatiRadius.pass)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(notice.fiduciary.name, style: style.headlineMedium?.copyWith(color: SammatiColors.surface)),
          if (notice.fiduciary.sector != null)
            Text(notice.fiduciary.sector!, style: style.bodyLarge?.copyWith(color: SammatiColors.surface)),
          const SizedBox(height: 8),
          Text(
            t.asking_for_purposes(purposeCount),
            style: style.titleMedium?.copyWith(color: SammatiColors.surface),
          ),
        ],
      ),
    );
  }
}

class _PurposeCard extends StatelessWidget {
  const _PurposeCard({
    required this.purpose,
    required this.company,
    required this.language,
    required this.enabled,
    required this.selected,
    required this.expiry,
    required this.onSelected,
    required this.onExpiry,
  });

  final NoticePurpose purpose;
  final String company;
  final String language;
  final bool enabled;
  final bool selected;
  final ConsentExpiry expiry;
  final ValueChanged<bool> onSelected;
  final ValueChanged<ConsentExpiry> onExpiry;

  String _retention(AppLocalizations t) {
    final days = purpose.retentionDays;
    if (days < 60) return t.retention_days(days);
    return t.retention_months((days / 30.4375).round());
  }

  String _expiryLabel(AppLocalizations t, ConsentExpiry e) => switch (e) {
        ConsentExpiry.days30 => t.expiry_30d,
        ConsentExpiry.months6 => t.expiry_6m,
        ConsentExpiry.year1 => t.expiry_1y,
      };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final title = purpose.title.forLanguage(language);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: SammatiColors.surface,
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        border: Border.all(color: selected ? SammatiColors.ink : SammatiColors.line, width: selected ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: style.titleLarge)),
              MergeSemantics(
                child: Semantics(
                  label: t.purpose_switch_label(title, company),
                  child: Switch(value: selected, onChanged: enabled ? onSelected : null),
                ),
              ),
            ],
          ),
          if (purpose.required) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.info_outline, size: 16, color: SammatiColors.mute),
                const SizedBox(width: 6),
                Text(t.needed_for_service, style: style.bodySmall),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(purpose.description.forLanguage(language), style: style.bodyLarge),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final c in purpose.dataCategories) _Chip(label: c)],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.schedule, size: 18, color: SammatiColors.mute),
              const SizedBox(width: 6),
              Expanded(child: Text(_retention(t), style: style.bodyMedium)),
            ],
          ),
          if (purpose.sharesThirdParty) ...[
            const SizedBox(height: 8),
            _Chip(label: t.shares_third_party, icon: Icons.warning_amber_rounded, danger: true),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: Text(t.expiry_label, style: style.bodyMedium)),
              DropdownButton<ConsentExpiry>(
                value: expiry,
                underline: const SizedBox.shrink(),
                borderRadius: BorderRadius.circular(SammatiRadius.row),
                itemHeight: 56,
                onChanged: enabled ? (e) => onExpiry(e!) : null,
                items: [
                  for (final e in ConsentExpiry.values) DropdownMenuItem(value: e, child: Text(_expiryLabel(t, e))),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Status never relies on colour alone: the third-party flag carries text and an icon (ui.md §7).
class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.danger = false});

  final String label;
  final IconData? icon;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? SammatiColors.block : SammatiColors.ink;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: danger ? SammatiColors.block.withValues(alpha: 0.1) : SammatiColors.paper,
        borderRadius: BorderRadius.circular(SammatiRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 16, color: color), const SizedBox(width: 4)],
          Flexible(
            child: Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: color)),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.errorText, required this.label, required this.onPressed, required this.busy});

  final String? errorText;
  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Material(
      color: SammatiColors.surface,
      elevation: 4,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (errorText != null) ...[
                Semantics(
                  liveRegion: true,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline, size: 20, color: SammatiColors.block),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(errorText!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: SammatiColors.block)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Text(t.withdraw_easy, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                  onPressed: onPressed,
                  child: busy
                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3))
                      : Text(label),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    // A notice that failed verification must not be retried: the QR code itself is untrustworthy.
    final retryable = error is! NoticeRejectedException && !(error is CoreException && (error as CoreException).failure == CoreFailure.notFound);
    final message = switch (error) {
      NoticeRejectedException() => t.notice_mismatch,
      CoreException(failure: CoreFailure.unreachable) => t.error_unreachable,
      CoreException(failure: CoreFailure.notFound) => t.request_gone,
      _ => t.error_generic,
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: SammatiColors.block),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
            if (retryable) ...[
              const SizedBox(height: 24),
              FilledButton(onPressed: onRetry, child: Text(t.retry)),
            ],
          ],
        ),
      ),
    );
  }
}

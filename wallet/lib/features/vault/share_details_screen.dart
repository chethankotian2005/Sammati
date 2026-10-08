import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/consents_controller.dart';
import '../../core/data_categories.dart';
import '../../core/format.dart';
import '../../core/profile_controller.dart';
import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../profile/profile_field_input.dart';
import 'vault_status.dart';

/// W10 share your details securely (W-13, ui.md W10): shows exactly the profile fields this purpose's data categories
/// need. What the profile has is listed; what it lacks is asked for here and saved, so it is asked once. Only those
/// fields are encrypted for the Processor, and only the ciphertext leaves. The values on this screen live in its state
/// and in the profile on the phone; nothing is logged or shown anywhere else.
class ShareDetailsScreen extends ConsumerStatefulWidget {
  const ShareDetailsScreen({super.key, required this.fiduciary, required this.purposeCode, this.companyName});

  final String fiduciary;
  final String purposeCode;

  /// Passed by the screen that opened this one; looked up from the consents otherwise.
  final String? companyName;

  @override
  ConsumerState<ShareDetailsScreen> createState() => _ShareDetailsScreenState();
}

class _ShareDetailsScreenState extends ConsumerState<ShareDetailsScreen> {
  /// Typed in this visit: field to value, `null` while invalid. Covers the missing fields and any the person edits.
  final Map<String, String?> _typed = {};
  final Set<String> _editing = {};
  bool _attempted = false;
  bool _asked = false;

  Future<void> _unlock() => ref.read(profileProvider.notifier).unlock(reason: AppLocalizations.of(context).auth_reason_profile);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_asked) return;
    _asked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !ref.read(profileProvider).isUnlocked) _unlock();
    });
  }

  @override
  void dispose() {
    _typed.clear();
    super.dispose();
  }

  List<String> _categories() {
    final consent = ref.read(consentsProvider).snapshot?.company(widget.fiduciary)?.consents.where((c) => c.code == widget.purposeCode);
    return consent == null || consent.isEmpty ? const [] : consent.first.dataCategories;
  }

  /// The value to send for a field: what was typed this visit, else what the profile holds.
  String? _valueOf(String field, ProfileFields profile) => _typed.containsKey(field) ? _typed[field] : profile[field];

  bool _ready(List<String> fields, ProfileFields profile) =>
      fields.isNotEmpty &&
      fields.every((f) {
        final v = _valueOf(f, profile);
        return v != null && v.isNotEmpty && isValidFieldValue(f, v);
      });

  Future<void> _send(List<String> fields, String reason) async {
    final profile = ref.read(profileProvider).doc.fields;
    final payload = {for (final f in fields) f: _valueOf(f, profile)!};
    final key = VaultKey(widget.fiduciary, widget.purposeCode);
    setState(() => _attempted = true);
    // Saved first: a value typed here is kept for next time even if this send fails.
    final changed = {for (final e in payload.entries) if (profile[e.key] != e.value) e.key: e.value};
    if (changed.isNotEmpty) await ref.read(profileProvider.notifier).setFields(changed);
    await ref.read(vaultProvider(key).notifier).send(reason: reason, payload: payload);
    if (mounted && ref.read(vaultProvider(key)).stage == VaultStage.sent) {
      setState(() {
        _typed.clear();
        _editing.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final company = widget.companyName ??
        ref.watch(consentsProvider).snapshot?.company(widget.fiduciary)?.fiduciary.name ??
        shortHex(widget.fiduciary);
    final vault = ref.watch(vaultProvider(VaultKey(widget.fiduciary, widget.purposeCode)));
    final profile = ref.watch(profileProvider);
    final sending = vault.stage == VaultStage.sending;
    final sent = _attempted && vault.stage == VaultStage.sent;
    final fields = fieldsFor(_categories());

    Widget content;
    if (!profile.isUnlocked) {
      content = Column(children: [
        const SizedBox(height: 48),
        const Icon(Icons.lock_outline, size: 56, color: SammatiColors.mute),
        const SizedBox(height: 16),
        Text(profile.stage == ProfileStage.lost ? t.profile_lost : t.profile_locked, textAlign: TextAlign.center, style: style.titleMedium),
        const SizedBox(height: 24),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(160, 56)),
          onPressed: profile.stage == ProfileStage.lost ? () => ref.read(profileProvider.notifier).startOver() : _unlock,
          child: Text(profile.stage == ProfileStage.lost ? t.retry : t.profile_unlock),
        ),
      ]);
    } else if (fields.isEmpty) {
      content = Text(t.share_none_needed(company), style: style.bodyLarge);
    } else {
      final have = [for (final f in fields) if ((profile.doc.fields[f] ?? '') != '' && !_editing.contains(f)) f];
      final ask = [for (final f in fields) if (!have.contains(f)) f];
      content = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!sent) ...[
          if (have.isNotEmpty) ...[
            Semantics(header: true, child: Text(t.share_have, style: style.titleMedium)),
            const SizedBox(height: 8),
            for (final f in have)
              ListTile(
                contentPadding: EdgeInsets.zero,
                minTileHeight: 56,
                title: Text(categoryLabel(context, categoryForField(f)!)),
                subtitle: Text(displayValue(t, categoryForField(f)!, profile.doc.fields[f]!), style: style.bodyLarge),
                trailing: TextButton(onPressed: sending ? null : () => setState(() => _editing.add(f)), child: Text(t.share_edit)),
              ),
            const SizedBox(height: 8),
          ],
          if (ask.isNotEmpty) ...[
            Semantics(header: true, child: Text(t.share_missing(company), style: style.titleMedium)),
            const SizedBox(height: 12),
            for (final f in ask) ...[
              ProfileFieldInput(
                key: ValueKey('share-$f'),
                category: categoryForField(f)!,
                initial: profile.doc.fields[f] ?? '',
                enabled: !sending,
                onChanged: (v) => setState(() => _typed[f] = v),
              ),
              const SizedBox(height: 12),
            ],
            Text(t.share_saved_note, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
            const SizedBox(height: 16),
          ],
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: _ready(fields, profile.doc.fields) && !sending ? () => _send(fields, t.auth_reason_vault) : null,
            child: Text(t.vault_send),
          ),
          const SizedBox(height: 16),
        ],
      ]);
    }

    return Scaffold(
      // The heading is in the body: in Hindi and Kannada, or at large text, it needs more than the one line an app bar gives.
      appBar: AppBar(),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(header: true, child: Text(t.share_title, style: style.headlineSmall)),
          const SizedBox(height: 8),
          Text(t.share_intro(company), style: style.bodyLarge),
          const SizedBox(height: 16),
          content,
          if (_attempted) VaultStatusLines(stage: vault.stage, vault: vault, company: company),
          if (sent) ...[
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              onPressed: () => context.pop(),
              child: Text(t.done),
            ),
          ],
          const SizedBox(height: 24),
          Text(t.vault_simulated, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      ),
    );
  }
}

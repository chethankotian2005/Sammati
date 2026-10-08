import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data_categories.dart';
import '../../core/profile_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import 'profile_field_input.dart';

/// W15 My details (W-16, W-17): the profile by group, edited in a sheet. Locked until the device check passes; saving
/// never contacts a server.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _asked = false;

  Future<void> _unlock() async {
    final reason = AppLocalizations.of(context).auth_reason_profile;
    await ref.read(profileProvider.notifier).unlock(reason: reason);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_asked) return;
    _asked = true;
    // The prompt follows the screen opening, so the person sees what it is for.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !ref.read(profileProvider).isUnlocked) _unlock();
    });
  }

  Future<void> _edit(DataCategory c, String current) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _EditSheet(category: c, initial: current),
    );
    if (saved == true) messenger.showSnackBar(SnackBar(content: Text(t.profile_saved)));
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final profile = ref.watch(profileProvider);

    Widget body;
    if (profile.stage == ProfileStage.lost) {
      body = _Notice(
        icon: Icons.error_outline,
        text: t.profile_lost,
        action: t.retry,
        onAction: () => ref.read(profileProvider.notifier).startOver(),
      );
    } else if (!profile.isUnlocked) {
      body = _Notice(icon: Icons.lock_outline, text: t.profile_locked, action: t.profile_unlock, onAction: _unlock);
    } else {
      body = ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (profile.doc.isEmpty) ...[Text(t.profile_empty, style: style.bodyLarge), const SizedBox(height: 16)],
          for (final g in categoryGroups) ...[
            Semantics(header: true, child: Padding(padding: const EdgeInsets.only(top: 8, bottom: 8), child: Text(groupLabel(context, g.id), style: style.titleMedium))),
            DecoratedBox(
              decoration: BoxDecoration(
                color: SammatiColors.surface,
                borderRadius: BorderRadius.circular(SammatiRadius.row),
                border: Border.all(color: SammatiColors.line),
              ),
              child: Column(children: [
                for (final c in dataCategories.where((c) => c.group == g.id))
                  ListTile(
                    minTileHeight: 56,
                    title: Text(categoryLabel(context, c)),
                    subtitle: Text(
                      profile.doc.fields[c.field] == null ? t.profile_not_set : displayValue(t, c, profile.doc.fields[c.field]!),
                      style: profile.doc.fields[c.field] == null ? style.bodyMedium?.copyWith(color: SammatiColors.mute) : style.bodyLarge,
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _edit(c, profile.doc.fields[c.field] ?? ''),
                  ),
              ]),
            ),
          ],
          const SizedBox(height: 16),
          Text(t.profile_private, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      );
    }

    return Scaffold(appBar: AppBar(title: Text(t.profile_title)), body: body);
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, required this.action, required this.onAction});

  final IconData icon;
  final String text;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 56, color: SammatiColors.mute),
          const SizedBox(height: 16),
          Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 24),
          FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(160, 56)), onPressed: onAction, child: Text(action)),
        ]),
      ),
    );
  }
}

class _EditSheet extends ConsumerStatefulWidget {
  const _EditSheet({required this.category, required this.initial});

  final DataCategory category;
  final String initial;

  @override
  ConsumerState<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends ConsumerState<_EditSheet> {
  late String? _value = widget.initial;
  bool _busy = false;

  Future<void> _save(String? value) async {
    setState(() => _busy = true);
    await ref.read(profileProvider.notifier).setFields({widget.category.field: value ?? ''});
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ProfileFieldInput(category: widget.category, initial: widget.initial, enabled: !_busy, onChanged: (v) => setState(() => _value = v)),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            onPressed: _busy || _value == null || _value == widget.initial ? null : () => _save(_value),
            child: Text(t.profile_save),
          ),
          if (widget.initial.isNotEmpty)
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size.fromHeight(48), foregroundColor: SammatiColors.block),
              onPressed: _busy ? null : () => _save(''),
              child: Text(t.profile_remove),
            ),
        ]),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/activity.dart';
import '../../core/profile_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../activity/activity_text.dart';
import '../shell/hash_text.dart';

/// "How your data was used" (W-18, ui.md W7): what was used, where it was stored, where it was processed and what left
/// the Processor, for one Processor use. Everything shown is a category name, a hash or a decision: never a value.
/// The stored-copy hash comes from this phone's own record of what it sent, so it is the real ciphertext hash.
class DataUseBlock extends ConsumerWidget {
  const DataUseBlock({super.key, required this.item});

  final ActivityItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final hash = ref.watch(profileProvider).hashes[shareKey(item.fiduciary, item.purposeCode)];
    final categories = item.dataCategories ?? const <String>[];
    final outcome = outcomeText(t, item.outcome ?? '');

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: SammatiColors.surface,
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        border: Border.all(color: SammatiColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text(t.use_title, style: style.titleMedium)),
          const SizedBox(height: 12),
          _Row(label: t.use_what, child: Text(categories.isEmpty ? '-' : categoriesText(context, categories), style: style.bodyLarge)),
          _Row(
            label: t.use_stored,
            child: hash == null
                ? Text(t.use_stored_unknown, style: style.bodyMedium?.copyWith(color: SammatiColors.mute))
                : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t.use_stored_value, style: style.bodyMedium), HashText(hash)]),
          ),
          _Row(label: t.use_where, child: Text(t.use_where_value, style: style.bodyLarge)),
          _Row(label: t.use_left, child: Text(t.use_left_value(outcome), style: style.bodyLarge), last: true),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.child, this.last = false});

  final String label;
  final Widget child;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: last ? 0 : 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: SammatiColors.mute)),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// W8 rights. The three entries are listed now; their forms arrive with W-10,
/// so they are shown disabled rather than as dead taps.
class RightsScreen extends StatelessWidget {
  const RightsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final entries = [
      (Icons.visibility_outlined, t.rights_access),
      (Icons.delete_outline, t.rights_erasure),
      (Icons.report_gmailerrorred_outlined, t.rights_grievance),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(t.nav_rights)),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: entries.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final (icon, label) = entries[i];
          return Material(
            color: SammatiColors.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(SammatiRadius.row),
              side: const BorderSide(color: SammatiColors.line),
            ),
            child: ListTile(
              enabled: false,
              minTileHeight: 56,
              leading: Icon(icon, color: SammatiColors.mute),
              title: Text(label, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: SammatiColors.mute)),
            ),
          );
        },
      ),
    );
  }
}

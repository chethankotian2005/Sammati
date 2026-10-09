import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// W16 About: what this build is, where the profile lives, and that there is no account recovery (drd.md §3b).
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(t.about_title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(t.about_prototype, style: style.bodyLarge),
          const SizedBox(height: 16),
          Text(t.profile_private, style: style.bodyLarge),
          const SizedBox(height: 24),
          DecoratedBox(
            decoration: BoxDecoration(
              color: SammatiColors.surface,
              borderRadius: BorderRadius.circular(SammatiRadius.row),
              border: Border.all(color: SammatiColors.line),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Semantics(header: true, child: Text(t.about_no_recovery_title, style: style.titleMedium)),
                const SizedBox(height: 8),
                Text(t.about_no_recovery_body, style: style.bodyLarge),
              ]),
            ),
          ),
          const SizedBox(height: 24),
          Text(t.vault_simulated, style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      ),
    );
  }
}

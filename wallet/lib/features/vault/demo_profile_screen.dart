import 'package:flutter/material.dart';

import '../../core/demo_profile.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';

/// V1 my demo details: the fictional profile that "Send securely" encrypts. The only place in the app where it is
/// shown in the clear. Read only: nothing to edit, copy or share, and a standing note that the Processor is a
/// simulation (the demo must never present it as production security).
class DemoProfileScreen extends StatelessWidget {
  const DemoProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(t.vault_profile_title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: SammatiColors.surface,
              borderRadius: BorderRadius.circular(SammatiRadius.row),
              border: Border.all(color: SammatiColors.line),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Field(label: t.vault_pan, value: DemoProfile.pan, mono: true),
                  const Divider(height: 24, color: SammatiColors.line),
                  _Field(label: t.vault_income, value: DemoProfile.incomeBand),
                  const Divider(height: 24, color: SammatiColors.line),
                  _Field(label: t.vault_score, value: '${DemoProfile.score}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(t.vault_profile_note, style: text.bodyLarge),
          const SizedBox(height: 16),
          Text(t.vault_simulated, style: text.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, this.mono = false});

  final String label;
  final String value;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: text.bodyMedium?.copyWith(color: SammatiColors.mute)),
        const SizedBox(height: 4),
        Text(value, style: mono ? monoStyle() : text.titleLarge),
      ],
    );
  }
}

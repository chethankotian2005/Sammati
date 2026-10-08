import 'package:flutter/material.dart';

import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../shell/hash_text.dart';

/// One status line with an icon: status never relies on colour alone (ui.md §7).
class StatusLine extends StatelessWidget {
  const StatusLine({super.key, required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: color))),
        ],
      );
}

/// What happened to the details the customer sent: sending, sent (with the handle), erased, failed. Shared by the
/// pass (V2) and the share screen (W10), so the two never disagree. Nothing for the idle state.
class VaultStatusLines extends StatelessWidget {
  const VaultStatusLines({super.key, required this.stage, required this.vault, required this.company});

  final VaultStage stage;
  final VaultState vault;
  final String company;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return switch (stage) {
      VaultStage.sending => StatusLine(icon: Icons.hourglass_top, color: SammatiColors.mute, text: t.vault_sending),
      VaultStage.sent => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            StatusLine(icon: Icons.lock, color: SammatiColors.allow, text: t.vault_sent(company)),
            if (vault.handle != null) HashText(vault.handle!),
          ],
        ),
      VaultStage.erased => StatusLine(icon: Icons.delete_outline, color: SammatiColors.mute, text: t.vault_erased),
      VaultStage.failed => StatusLine(
          icon: Icons.error_outline,
          color: SammatiColors.block,
          text: switch (vault.problem) {
            VaultProblem.authFailed => t.wallet_auth_failed,
            VaultProblem.unreachable => t.error_unreachable,
            _ => t.vault_failed,
          },
        ),
      VaultStage.idle => const SizedBox.shrink(),
    };
  }
}

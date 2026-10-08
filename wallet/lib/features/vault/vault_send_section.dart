import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import '../shell/hash_text.dart';

/// V2 send securely, under the credit-check row of a pass (ui.md V2). Only built for a purpose that carries data and
/// only while that consent is active; withdrawing needs no extra step, because the withdrawal is what erases.
class VaultSendSection extends ConsumerWidget {
  const VaultSendSection({super.key, required this.fiduciary, required this.company, required this.purposeCode, required this.consentActive});

  final String fiduciary;
  final String company;
  final String purposeCode;
  final bool consentActive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final key = VaultKey(fiduciary, purposeCode);
    final vault = ref.watch(vaultProvider(key));

    // A withdrawn consent means the copy is gone, whether or not the live frame has arrived yet.
    final stage = !consentActive && vault.stage == VaultStage.sent ? VaultStage.erased : vault.stage;
    // Nothing to send while the consent is not active, and nothing to say if nothing was ever sent.
    if (!consentActive && stage != VaultStage.erased) return const SizedBox.shrink();

    Widget line(IconData icon, Color color, String text) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: style.bodyMedium?.copyWith(color: color))),
          ],
        );

    final send = TextButton.icon(
      style: TextButton.styleFrom(minimumSize: const Size(48, 48), alignment: Alignment.centerLeft),
      onPressed: () => ref.read(vaultProvider(key).notifier).send(reason: t.auth_reason_vault),
      icon: const Icon(Icons.lock_outline),
      label: Text(stage == VaultStage.sent ? t.vault_send_again : t.vault_send),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(height: 8, color: SammatiColors.line),
          switch (stage) {
            VaultStage.sending => line(Icons.hourglass_top, SammatiColors.mute, t.vault_sending),
            VaultStage.sent => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  line(Icons.lock, SammatiColors.allow, t.vault_sent(company)),
                  if (vault.handle != null) HashText(vault.handle!),
                  send,
                ],
              ),
            VaultStage.erased => line(Icons.delete_outline, SammatiColors.mute, t.vault_erased),
            VaultStage.failed => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  line(Icons.error_outline, SammatiColors.block, switch (vault.problem) {
                    VaultProblem.authFailed => t.wallet_auth_failed,
                    VaultProblem.unreachable => t.error_unreachable,
                    _ => t.vault_failed,
                  }),
                  send,
                ],
              ),
            VaultStage.idle => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  send,
                  Text(t.vault_send_hint(company), style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
                ],
              ),
          },
        ],
      ),
    );
  }
}

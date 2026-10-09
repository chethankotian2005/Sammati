import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';
import 'stale_note.dart';
import 'vault_status.dart';

/// V2 send securely, under the credit-check row of a pass (ui.md V2). Only built for a purpose that carries data and
/// only while that consent is active; withdrawing needs no extra step, because the withdrawal is what erases.
/// The button opens W10, where the customer chooses what is sent.
class VaultSendSection extends ConsumerWidget {
  const VaultSendSection({super.key, required this.fiduciary, required this.company, required this.purposeCode, required this.consentActive, this.categories = const [], this.noticeHash});

  final String fiduciary;
  final String company;
  final String purposeCode;
  final bool consentActive;
  final List<String> categories;
  final String? noticeHash;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;
    final vault = ref.watch(vaultProvider(VaultKey(fiduciary, purposeCode)));

    // A withdrawn consent means the copy is gone, whether or not the live frame has arrived yet.
    final stage = !consentActive && vault.stage == VaultStage.sent ? VaultStage.erased : vault.stage;
    // Nothing to send while the consent is not active, and nothing to say if nothing was ever sent.
    if (!consentActive && stage != VaultStage.erased) return const SizedBox.shrink();

    final send = TextButton.icon(
      style: TextButton.styleFrom(minimumSize: const Size(48, 48), alignment: Alignment.centerLeft),
      onPressed: () => context.push(Routes.shareFor(fiduciary, purposeCode), extra: company),
      icon: const Icon(Icons.lock_outline),
      label: Text(stage == VaultStage.sent ? t.vault_send_again : t.vault_send),
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(height: 8, color: SammatiColors.line),
          VaultStatusLines(stage: stage, vault: vault, company: company, categories: categories),
          if (consentActive) StaleDetailsNote(fiduciary: fiduciary, company: company, purposeCode: purposeCode, categories: categories, noticeHash: noticeHash),
          if (stage != VaultStage.erased) send,
          if (stage == VaultStage.idle) Text(t.vault_send_hint(company), style: style.bodyMedium?.copyWith(color: SammatiColors.mute)),
        ],
      ),
    );
  }
}

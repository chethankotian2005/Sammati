import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data_categories.dart';
import '../../core/profile_controller.dart';
import '../../core/vault_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// "Your details changed. Update what {company} holds?" (W-17): shown on a pass and on the company's card when an edit
/// touched a field that was sent for an active consent. One tap re-encrypts only that purpose's fields and submits them
/// again; the Processor replaces the old copy. Shows nothing when nothing is stale.
class StaleDetailsNote extends ConsumerWidget {
  const StaleDetailsNote({super.key, required this.fiduciary, required this.company, required this.purposeCode, required this.categories});

  final String fiduciary;
  final String company;
  final String purposeCode;
  final List<String> categories;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    if (!shareIsStale(profile, fiduciary, purposeCode)) return const SizedBox.shrink();
    final t = AppLocalizations.of(context);
    final vault = ref.watch(vaultProvider(VaultKey(fiduciary, purposeCode)));
    final sending = vault.stage == VaultStage.sending;

    Future<void> update() async {
      final notifier = ref.read(profileProvider.notifier);
      if (!await notifier.unlock(reason: t.auth_reason_profile)) return;
      final fields = ref.read(profileProvider).doc.fields;
      final payload = profilePayload(fields, categories);
      await ref.read(vaultProvider(VaultKey(fiduciary, purposeCode)).notifier).send(reason: t.auth_reason_vault, payload: payload);
    }

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: SammatiColors.surface,
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        border: Border.all(color: SammatiColors.marigold),
      ),
      child: Row(children: [
        const Icon(Icons.sync_problem, color: SammatiColors.ink),
        const SizedBox(width: 8),
        Expanded(child: Text(t.details_changed(company), style: Theme.of(context).textTheme.bodyMedium)),
        TextButton(
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
          onPressed: sending ? null : update,
          child: Text(t.details_update),
        ),
      ]),
    );
  }
}

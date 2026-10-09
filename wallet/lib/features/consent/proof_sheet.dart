// W-07 proof sheet (ui.md §2 W7, prd.md W-07, trd.md §6.1).
//
// Can be shown as a bottom sheet from:
//   - An activity row (access proof, includes Merkle check)
//   - The receipt screen "View proof" button (consent proof)
//
// The sheet fetches the proof, runs the Merkle verifier locally in Dart, and
// shows the result. All network IO is async so the sheet is immediately visible
// with a loading state.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/activity.dart';
import '../../core/consent_providers.dart';
import '../../core/core_api.dart';
import '../../core/preferences.dart';
import '../../core/proof.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';
import '../../theme/tokens.dart';
import '../shell/hash_text.dart';
import 'data_use_block.dart';

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/// Opens the proof sheet for an access-log entry (`/v1/proof/access/:entryId`).
/// Call from activity row tap.
Future<void> showAccessProofSheet(BuildContext context, String entryId, {ActivityItem? item}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(SammatiRadius.pass)),
    ),
    builder: (_) => _ProofSheet(mode: _ProofMode.access(entryId, item)),
  );
}

/// Opens the proof sheet for a consent transaction (`/v1/proof/consent/:txHash`).
/// Call from the receipt "View proof" button.
Future<void> showConsentProofSheet(BuildContext context, String txHash) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(SammatiRadius.pass)),
    ),
    builder: (_) => _ProofSheet(mode: _ProofMode.consent(txHash)),
  );
}

// ---------------------------------------------------------------------------
// Internal mode discriminant
// ---------------------------------------------------------------------------

enum _ProofKind { access, consent }

class _ProofMode {
  const _ProofMode.access(this.id, [this.item]) : kind = _ProofKind.access;
  const _ProofMode.consent(this.id) : kind = _ProofKind.consent, item = null;

  final _ProofKind kind;
  final String id;

  @override
  bool operator ==(Object other) => other is _ProofMode && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);

  /// The Activity row the sheet was opened from, when there is one: it carries the data-use facts (W-18).
  final ActivityItem? item;
}


// ---------------------------------------------------------------------------
// Async proof loader
// ---------------------------------------------------------------------------

sealed class _ProofResult {
  const _ProofResult();
}

class _Loading extends _ProofResult {
  const _Loading();
}

class _AccessResult extends _ProofResult {
  const _AccessResult(this.proof, this.merkleOk);

  final AccessProof proof;

  /// True = Merkle path verified locally, false = failed, null = no proof path provided.
  final bool? merkleOk;
}

class _ConsentResult extends _ProofResult {
  const _ConsentResult(this.proof);

  final ConsentProof proof;
}

class _Failed extends _ProofResult {
  const _Failed();
}

// One result per thing being proven. A family keyed by kind and id, not a nested ProviderScope: an unscoped provider
// cannot read a scoped one.
final _proofResultProvider = FutureProvider.autoDispose.family<_ProofResult, _ProofMode>((ref, mode) async {
  final api = ref.watch(coreApiFactoryProvider)(ref.watch(coreUrlProvider));
  if (mode.kind == _ProofKind.access) {
    final proof = await api.getAccessProof(mode.id);
    // Run the Merkle verifier if there is a proof path; null means "no batch yet".
    final merkleOk = proof.merkleProof.isEmpty
        ? null
        : MerkleVerifier.verify(
            leafHash: proof.entryHash,
            proof: proof.merkleProof,
            expectedRoot: proof.merkleRoot,
          );
    return _AccessResult(proof, merkleOk);
  } else {
    final proof = await api.getConsentProof(mode.id);
    return _ConsentResult(proof);
  }
});

// ---------------------------------------------------------------------------
// Sheet UI
// ---------------------------------------------------------------------------

class _ProofSheet extends ConsumerWidget {
  const _ProofSheet({required this.mode});

  final _ProofMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLocalizations.of(context);
    final result = ref.watch(_proofResultProvider(mode));

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.92,
      builder: (_, controller) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: SammatiColors.line,
                  borderRadius: BorderRadius.circular(SammatiRadius.pill),
                ),
              ),
            ),
            Expanded(
              child: result.when(
                loading: () => Center(child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(t.proof_loading, style: Theme.of(context).textTheme.bodyMedium),
                  ],
                )),
                error: (_, __) => _FailedBody(onRetry: () => ref.invalidate(_proofResultProvider(mode))),
                data: (r) => switch (r) {
                  _AccessResult(:final proof, :final merkleOk) => _AccessBody(
                      proof: proof,
                      merkleOk: merkleOk,
                      item: mode.item,
                      scrollController: controller,
                    ),
                  _ConsentResult(:final proof) => _ConsentBody(
                      proof: proof,
                      scrollController: controller,
                    ),
                  _ => _FailedBody(onRetry: () => ref.invalidate(_proofResultProvider(mode))),
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Access proof body
// ---------------------------------------------------------------------------

class _AccessBody extends StatelessWidget {
  const _AccessBody({
    required this.proof,
    required this.merkleOk,
    required this.scrollController,
    this.item,
  });

  final AccessProof proof;
  final bool? merkleOk;
  final ActivityItem? item;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;

    return ListView(
      controller: scrollController,
      children: [
        if (item != null && item!.isDataUse && (item!.dataCategories ?? const []).isNotEmpty) DataUseBlock(item: item!),
        Text(t.proof_headline, style: style.bodyLarge),
        const SizedBox(height: 24),
        _ProofRow(label: t.proof_record_hash, child: HashText(proof.entryHash)),
        _ProofRow(label: t.proof_batch_anchor, child: HashText(proof.anchorTxHash)),
        _MerkleRow(merkleOk: merkleOk),
        if (proof.explorerUrl.isNotEmpty) ...[
          const SizedBox(height: 8),
          _ExplorerButton(url: proof.explorerUrl),
        ],
        const SizedBox(height: 32),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Consent proof body
// ---------------------------------------------------------------------------

class _ConsentBody extends StatelessWidget {
  const _ConsentBody({required this.proof, required this.scrollController});

  final ConsentProof proof;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;

    return ListView(
      controller: scrollController,
      children: [
        // A consent proof is about signing, not Merkle: use the plain recorded sentence.
        Text(t.recorded, style: style.bodyLarge),
        const SizedBox(height: 24),
        _ProofRow(label: t.proof_consent_signer, child: HashText(proof.signer)),
        _ProofRow(label: t.proof_ledger_head, child: HashText(proof.ledgerHead)),
        _ProofRow(label: t.proof_consent_tx, child: HashText(proof.txHash)),
        if (proof.explorerUrl.isNotEmpty) ...[
          const SizedBox(height: 8),
          _ExplorerButton(url: proof.explorerUrl),
        ],
        const SizedBox(height: 32),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Reusable sub-widgets
// ---------------------------------------------------------------------------

class _ProofRow extends StatelessWidget {
  const _ProofRow({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: style.bodySmall?.copyWith(color: SammatiColors.mute)),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }
}

class _MerkleRow extends StatelessWidget {
  const _MerkleRow({required this.merkleOk});

  final bool? merkleOk;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final style = Theme.of(context).textTheme;

    final (label, color, icon) = switch (merkleOk) {
      null => (t.proof_merkle_checking, SammatiColors.mute, Icons.hourglass_top_outlined),
      true => (t.proof_merkle_verified, SammatiColors.allow, Icons.verified_outlined),
      false => (t.proof_merkle_failed, SammatiColors.block, Icons.error_outline),
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Text(label, style: style.titleMedium?.copyWith(color: color)),
        ],
      ),
    );
  }
}

class _ExplorerButton extends StatelessWidget {
  const _ExplorerButton({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return OutlinedButton.icon(
      icon: const Icon(Icons.open_in_new, size: 18),
      label: Text(t.proof_open_explorer),
      onPressed: () {
        final uri = Uri.tryParse(url);
        if (uri != null) unawaited(launchUrl(uri, mode: LaunchMode.externalApplication));
      },
    );
  }
}

class _FailedBody extends StatelessWidget {
  const _FailedBody({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(t.proof_failed, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: onRetry, child: Text(t.retry)),
        ],
      ),
    );
  }
}

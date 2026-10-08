// State of "Send securely" for one purpose of one company (ui.md V2): idle, sending, sent (with the handle),
// erased (when the Processor says so over the live socket), or failed. One Riverpod family provider per
// (company, purpose), patched live from vault.stored / vault.erased frames.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'consent_providers.dart';
import 'consents_controller.dart';
import 'core_api.dart';
import 'live_events.dart';
import 'preferences.dart';
import 'profile.dart';
import 'profile_controller.dart';
import 'processor_api.dart';
import 'wallet_service.dart';

enum VaultStage { idle, sending, sent, erased, failed }

/// Why a send failed, for the screen to word. The Processor's refusal is a consent reason code.
enum VaultProblem { none, authFailed, unreachable, refused, other }

class VaultState {
  const VaultState({this.stage = VaultStage.idle, this.handle, this.problem = VaultProblem.none});

  final VaultStage stage;

  /// The handle of the copy the Processor holds, once sent.
  final String? handle;
  final VaultProblem problem;
}

class VaultKey {
  const VaultKey(this.fiduciary, this.purposeCode);

  final String fiduciary;
  final String purposeCode;

  @override
  bool operator ==(Object other) =>
      other is VaultKey && other.fiduciary.toLowerCase() == fiduciary.toLowerCase() && other.purposeCode == purposeCode;

  @override
  int get hashCode => Object.hash(fiduciary.toLowerCase(), purposeCode);
}

class VaultController extends Notifier<VaultState> {
  VaultController(this._key);

  final VaultKey _key;

  @override
  VaultState build() {
    final live = ref.watch(liveEventsProvider);
    if (live != null) {
      final sub = live.vaultUpdates.listen(_onLive);
      ref.onDispose(() => unawaited(sub.cancel()));
    }
    return const VaultState();
  }

  /// [payload] is what is encrypted: the profile entries this purpose's categories name (W10, W-13). On success the
  /// send is recorded in the profile (field names and the handle, no values) so a later edit can mark it (W-17).
  Future<void> send({required String reason, required Map<String, String> payload}) async {
    if (state.stage == VaultStage.sending) return;
    state = const VaultState(stage: VaultStage.sending);
    try {
      final sent = await ref.read(vaultFlowProvider).send(
            coreUrl: ref.read(coreUrlProvider),
            fiduciary: _key.fiduciary,
            purposeCode: _key.purposeCode,
            reason: reason,
            profile: payload,
          );
      await _remember(sent.handle, payload.keys.toList());
      // The live frame may already have set the same state; this keeps it correct without a socket.
      state = VaultState(stage: VaultStage.sent, handle: sent.handle);
    } on WalletException {
      state = const VaultState(stage: VaultStage.failed, problem: VaultProblem.authFailed);
    } on VaultRefusedException {
      state = const VaultState(stage: VaultStage.failed, problem: VaultProblem.refused);
    } on CoreException catch (e) {
      state = VaultState(stage: VaultStage.failed, problem: e.failure == CoreFailure.unreachable ? VaultProblem.unreachable : VaultProblem.other);
    }
  }

  Future<void> _remember(String handle, List<String> fields) async {
    try {
      await ref.read(profileProvider.notifier).recordShare(ShareRecord(
            fiduciary: _key.fiduciary,
            purposeCode: _key.purposeCode,
            fields: fields,
            handle: handle,
            sentAt: ref.read(clockProvider)().millisecondsSinceEpoch ~/ 1000,
          ));
    } on Object {
      // The data was sent. Failing to note it only means a later edit is not marked, which the person can still redo.
    }
  }

  void _onLive(VaultNotice event) {
    // The socket is subscribed to this customer only and drops other principals' frames (live_events.dart).
    if (VaultKey(event.fiduciary, event.purposeCode) != _key) return;
    state = switch (event.kind) {
      VaultNoticeKind.stored => VaultState(stage: VaultStage.sent, handle: event.handle),
      // An erase of a copy that is no longer the current one changes nothing.
      VaultNoticeKind.erased => state.handle == null || state.handle == event.handle ? VaultState(stage: VaultStage.erased, handle: event.handle) : state,
    };
  }
}

final vaultProvider = NotifierProvider.autoDispose.family<VaultController, VaultState, VaultKey>(VaultController.new);

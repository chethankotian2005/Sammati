import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'consent_providers.dart';
import 'consents.dart';
import 'core_api.dart';
import 'live_events.dart';
import 'preferences.dart';
import 'wallet_providers.dart';

/// What the home screen renders. [snapshot] is kept when a refresh fails, so the last
/// known consents stay on screen with an offline banner (ui.md "Edge states").
class ConsentsState {
  const ConsentsState({this.snapshot, this.loading = false, this.fetchFailed = false, this.socketDown = false});

  final ConsentsSnapshot? snapshot;
  final bool loading;
  final bool fetchFailed;
  final bool socketDown;

  bool get offline => fetchFailed || socketDown;

  ConsentsState copyWith({ConsentsSnapshot? snapshot, bool? loading, bool? fetchFailed, bool? socketDown}) => ConsentsState(
        snapshot: snapshot ?? this.snapshot,
        loading: loading ?? this.loading,
        fetchFailed: fetchFailed ?? this.fetchFailed,
        socketDown: socketDown ?? this.socketDown,
      );
}

final liveEventsFactoryProvider = Provider<LiveEventsFactory>((ref) => WsLiveEvents.new);

/// The one socket to Core, shared by everything that reacts to live events. Null until the
/// wallet exists. Rebuilt (old socket closed) when the Core URL changes.
final liveEventsProvider = Provider<LiveEvents?>((ref) {
  final principal = ref.watch(walletAddressProvider).value;
  if (principal == null) return null;
  final live = ref.watch(liveEventsFactoryProvider)(ref.watch(coreUrlProvider), principal);
  ref.onDispose(live.dispose);
  return live;
});

class ConsentsController extends Notifier<ConsentsState> {
  @override
  ConsentsState build() {
    final principal = ref.watch(walletAddressProvider).value;
    if (principal == null) return const ConsentsState();
    ref.watch(coreUrlProvider);

    final live = ref.watch(liveEventsProvider);
    if (live == null) return const ConsentsState();
    final updates = live.consentUpdates.listen(_onUpdate);
    final connection = live.connection.listen(_onConnection);
    ref.onDispose(() {
      unawaited(updates.cancel());
      unawaited(connection.cancel());
    });

    // build() must return synchronously; the first fetch starts right after it.
    Future.microtask(refresh);
    return const ConsentsState(loading: true);
  }

  Future<void> refresh() async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    state = state.copyWith(loading: state.snapshot == null);
    try {
      final snapshot = await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).getConsents(principal);
      state = state.copyWith(snapshot: snapshot, loading: false, fetchFailed: false);
    } on CoreException {
      state = state.copyWith(loading: false, fetchFailed: true);
    }
  }

  void _onUpdate(ConsentUpdated event) {
    final current = state.snapshot;
    final updated = current?.applying(event);
    // An unknown purpose means a grant this screen has not seen yet: fetch rather than guess.
    if (updated == null) {
      unawaited(refresh());
    } else {
      state = state.copyWith(snapshot: updated);
    }
  }

  void _onConnection(bool connected) {
    state = state.copyWith(socketDown: !connected);
    // Updates sent while the socket was down are gone, so catch up on reconnect.
    if (connected) unawaited(refresh());
  }

  /// Shows a withdrawal immediately, from the transaction the wallet itself just made.
  /// The matching WebSocket event arrives later and changes nothing.
  void markWithdrawn(String fiduciary, String purposeId, String txHash) {
    final updated = state.snapshot?.applying(ConsentUpdated(
      principal: state.snapshot!.principal,
      fiduciary: fiduciary,
      purposeId: purposeId,
      status: ConsentStatus.withdrawn,
      expiresAt: null,
      txHash: txHash,
    ));
    if (updated != null) state = state.copyWith(snapshot: updated);
  }
}

final consentsProvider = NotifierProvider<ConsentsController, ConsentsState>(ConsentsController.new);

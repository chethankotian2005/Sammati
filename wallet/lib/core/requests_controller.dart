// The requests inbox (W-14), the blocked-companies list and the Sammati ID (N-01), as state. Live: a
// `consent.requested` frame refetches the inbox and marks the new card; a reconnect refetches what a dropped socket
// missed; offline, the last known list stays. Decline, Block and Register each sign a plain message behind one
// device-credential prompt (trd.md §4.5).

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'consent_providers.dart';
import 'consents_controller.dart';
import 'core_api.dart';
import 'preferences.dart';
import 'requests.dart';
import 'wallet_providers.dart';
import 'wallet_service.dart';

/// Why an action did not happen, for the screen to word.
enum RequestsProblem { none, authFailed, unreachable, taken, other }

class RequestsState {
  const RequestsState({this.items = const [], this.loaded = false, this.loading = false, this.fetchFailed = false, this.fresh = const {}, this.problem = RequestsProblem.none});

  /// Newest first, as Core sends them.
  final List<InboxRequest> items;

  /// A list has been fetched at least once: what is shown is real, not a placeholder.
  final bool loaded;
  final bool loading;

  /// The last fetch failed: the list shown is the last known one.
  final bool fetchFailed;

  /// Requests that arrived live and have not been looked at yet: they get the brief colour wash.
  final Set<String> fresh;
  final RequestsProblem problem;

  RequestsState copyWith({List<InboxRequest>? items, bool? loaded, bool? loading, bool? fetchFailed, Set<String>? fresh, RequestsProblem? problem}) => RequestsState(
        items: items ?? this.items,
        loaded: loaded ?? this.loaded,
        loading: loading ?? this.loading,
        fetchFailed: fetchFailed ?? this.fetchFailed,
        fresh: fresh ?? this.fresh,
        problem: problem ?? this.problem,
      );
}

class RequestsController extends Notifier<RequestsState> {
  @override
  RequestsState build() {
    ref.watch(coreUrlProvider);
    final live = ref.watch(liveEventsProvider);
    if (live != null) {
      final subs = [
        live.requestEvents.listen((e) => unawaited(refresh(fresh: e.requestId))),
        // A grant or a withdrawal can change what is open, and a reconnect may have missed a request.
        live.consentUpdates.listen((_) => unawaited(refresh())),
        live.connection.listen((up) {
          if (up) unawaited(refresh());
        }),
      ];
      ref.onDispose(() {
        for (final s in subs) {
          unawaited(s.cancel());
        }
      });
    }
    Future.microtask(refresh);
    return const RequestsState(loading: true);
  }

  CoreApi get _api => ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider));

  Future<void> refresh({String? fresh}) async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    state = state.copyWith(loading: !state.loaded);
    try {
      final items = await _api.getInbox(principal);
      final known = {for (final i in state.items) i.requestId};
      // Only what is new to this list washes in, and only if it arrived live.
      final washed = {...state.fresh, if (fresh != null && items.any((i) => i.requestId == fresh) && !known.contains(fresh)) fresh};
      state = state.copyWith(items: items, loaded: true, loading: false, fetchFailed: false, fresh: washed.intersection({for (final i in items) i.requestId}));
    } on CoreException {
      state = state.copyWith(loading: false, fetchFailed: true);
    }
  }

  /// The wash has played; the card is an ordinary one from now on.
  void settle(String requestId) {
    if (!state.fresh.contains(requestId)) return;
    state = state.copyWith(fresh: {...state.fresh}..remove(requestId));
  }

  int _now() => ref.read(clockProvider)().millisecondsSinceEpoch ~/ 1000;

  Future<bool> decline(InboxRequest request, {required String reason}) async {
    state = state.copyWith(problem: RequestsProblem.none);
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return false;
    try {
      final issuedAt = _now();
      final signature = await ref.read(walletServiceProvider).signMessage(declineMessage(request.requestId, principal, issuedAt), reason: reason);
      await _api.declineRequest(requestId: request.requestId, principal: principal, issuedAt: issuedAt, signature: signature);
      state = state.copyWith(items: [for (final i in state.items) if (i.requestId != request.requestId) i]);
      return true;
    } on WalletException {
      state = state.copyWith(problem: RequestsProblem.authFailed);
    } on CoreException catch (e) {
      state = state.copyWith(problem: e.failure == CoreFailure.unreachable ? RequestsProblem.unreachable : RequestsProblem.other);
    }
    return false;
  }

  /// Blocks the request's company: everything it has open here goes, and what it sends later is dropped by Core.
  Future<bool> block(InboxRequest request, {required String reason}) async {
    state = state.copyWith(problem: RequestsProblem.none);
    if (!await _setBlocked(request.fiduciary, 'block', reason: reason)) return false;
    state = state.copyWith(items: [for (final i in state.items) if (i.fiduciary.toLowerCase() != request.fiduciary.toLowerCase()) i]);
    unawaited(ref.read(blocksProvider.notifier).refresh());
    return true;
  }

  Future<bool> unblock(String fiduciary, {required String reason}) async {
    state = state.copyWith(problem: RequestsProblem.none);
    if (!await _setBlocked(fiduciary, 'unblock', reason: reason)) return false;
    unawaited(ref.read(blocksProvider.notifier).refresh());
    return true;
  }

  Future<bool> _setBlocked(String fiduciary, String action, {required String reason}) async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return false;
    try {
      final issuedAt = _now();
      final signature = await ref.read(walletServiceProvider).signMessage(blockMessage(action, fiduciary, principal, issuedAt), reason: reason);
      await _api.setBlocked(principal: principal, fiduciary: fiduciary, action: action, issuedAt: issuedAt, signature: signature);
      return true;
    } on WalletException {
      state = state.copyWith(problem: RequestsProblem.authFailed);
    } on CoreException catch (e) {
      state = state.copyWith(problem: e.failure == CoreFailure.unreachable ? RequestsProblem.unreachable : RequestsProblem.other);
    }
    return false;
  }
}

final requestsProvider = NotifierProvider<RequestsController, RequestsState>(RequestsController.new);

/// The companies this customer blocked, newest first. Loaded when the list is opened.
class BlocksController extends Notifier<List<BlockedCompany>> {
  @override
  List<BlockedCompany> build() => const [];

  Future<void> refresh() async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    try {
      state = await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).getBlocks(principal);
    } on CoreException {
      // keep the last known list
    }
  }
}

final blocksProvider = NotifierProvider<BlocksController, List<BlockedCompany>>(BlocksController.new);

/// The wallet's Sammati ID: null until one is registered.
class IdentityController extends AsyncNotifier<String?> {
  @override
  Future<String?> build() async {
    final principal = ref.watch(walletAddressProvider).value;
    if (principal == null) return null;
    try {
      return await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).getIdentity(principal);
    } on CoreException {
      return null; // offline: the screen still opens, and says nothing is registered rather than guessing
    }
  }

  /// Registers `<name>@sammati`. Returns what went wrong, or [RequestsProblem.none] when it worked.
  Future<RequestsProblem> register(String name, {required String reason}) async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return RequestsProblem.other;
    final handle = '${name.toLowerCase()}$sammatiSuffix';
    try {
      final issuedAt = ref.read(clockProvider)().millisecondsSinceEpoch ~/ 1000;
      final signature = await ref.read(walletServiceProvider).signMessage(identityMessage(handle, principal, issuedAt), reason: reason);
      await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).registerIdentity(handle: handle, principal: principal, issuedAt: issuedAt, signature: signature);
      state = AsyncData(handle);
      return RequestsProblem.none;
    } on WalletException {
      return RequestsProblem.authFailed;
    } on CoreException catch (e) {
      if (e.code == 'HANDLE_TAKEN') return RequestsProblem.taken;
      return e.failure == CoreFailure.unreachable ? RequestsProblem.unreachable : RequestsProblem.other;
    }
  }
}

final identityProvider = AsyncNotifierProvider<IdentityController, String?>(IdentityController.new);

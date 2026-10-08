import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'activity.dart';
import 'consent_providers.dart';
import 'consents_controller.dart';
import 'core_api.dart';
import 'preferences.dart';
import 'wallet_providers.dart';

/// Newest rows first. Old rows are dropped past this, so a long demo cannot grow the list forever.
const maxActivityItems = 200;

class ActivityState {
  const ActivityState({this.items = const [], this.loaded = false, this.loading = false, this.fetchFailed = false, this.socketDown = false});

  final List<ActivityItem> items;

  /// True once a fetch has succeeded, so an empty list can mean "no activity" rather than "not loaded".
  final bool loaded;
  final bool loading;
  final bool fetchFailed;
  final bool socketDown;

  bool get offline => fetchFailed || socketDown;

  ActivityState copyWith({List<ActivityItem>? items, bool? loaded, bool? loading, bool? fetchFailed, bool? socketDown}) => ActivityState(
        items: items ?? this.items,
        loaded: loaded ?? this.loaded,
        loading: loading ?? this.loading,
        fetchFailed: fetchFailed ?? this.fetchFailed,
        socketDown: socketDown ?? this.socketDown,
      );
}

class ActivityController extends Notifier<ActivityState> {
  @override
  ActivityState build() {
    if (ref.watch(walletAddressProvider).value == null) return const ActivityState();
    ref.watch(coreUrlProvider);

    final live = ref.watch(liveEventsProvider);
    if (live == null) return const ActivityState();
    final access = live.accessEvents.listen(_onLive);
    final connection = live.connection.listen(_onConnection);
    ref.onDispose(() {
      unawaited(access.cancel());
      unawaited(connection.cancel());
    });

    // build() must return synchronously; the first fetch starts right after it.
    Future.microtask(refresh);
    return const ActivityState(loading: true);
  }

  Future<void> refresh() async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    state = state.copyWith(loading: !state.loaded);
    try {
      final fetched = await ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider)).getActivity(principal);
      state = state.copyWith(items: _merge(fetched), loaded: true, loading: false, fetchFailed: false);
    } on CoreException {
      state = state.copyWith(loading: false, fetchFailed: true);
    }
  }

  /// The fetched list is the truth, but a row already on screen keeps its arrival stamp,
  /// so a refresh does not make it animate in a second time.
  List<ActivityItem> _merge(List<ActivityItem> fetched) {
    final known = {for (final i in state.items) i.id: i};
    final merged = [for (final i in fetched) known[i.id] ?? i]..sort((a, b) => b.at.compareTo(a.at));
    return merged.take(maxActivityItems).toList();
  }

  void _onLive(ActivityItem item) {
    if (state.items.any((i) => i.id == item.id)) return;
    state = state.copyWith(items: [item, ...state.items].take(maxActivityItems).toList());
  }

  void _onConnection(bool connected) {
    state = state.copyWith(socketDown: !connected);
    // Rows logged while the socket was down are only in the feed endpoint.
    if (connected) unawaited(refresh());
  }
}

final activityProvider = NotifierProvider<ActivityController, ActivityState>(ActivityController.new);

/// Which rows the feed shows. [decision] and [company] combine; null means "any".
class ActivityFilter {
  const ActivityFilter({this.decision, this.company});

  final Decision? decision;

  /// A company address.
  final String? company;

  bool get isAll => decision == null && company == null;

  bool matches(ActivityItem item) =>
      (decision == null || item.decision == decision) &&
      (company == null || item.fiduciary.toLowerCase() == company!.toLowerCase());
}

class ActivityFilterController extends Notifier<ActivityFilter> {
  @override
  ActivityFilter build() => const ActivityFilter();

  void showAll() => state = const ActivityFilter();

  void showDecision(Decision decision) => state = ActivityFilter(decision: decision, company: state.company);

  /// Tapping the selected company again clears it.
  void toggleCompany(String address) => state = ActivityFilter(
        decision: state.decision,
        company: state.company?.toLowerCase() == address.toLowerCase() ? null : address,
      );
}

final activityFilterProvider = NotifierProvider<ActivityFilterController, ActivityFilter>(ActivityFilterController.new);

/// Ticks so "2 s ago" keeps counting. Tests replace it with an empty stream, because a
/// periodic timer never lets `pumpAndSettle` finish.
final clockTickProvider = StreamProvider.autoDispose<DateTime>((ref) {
  final clock = ref.watch(clockProvider);
  return Stream.periodic(const Duration(seconds: 1), (_) => clock());
});

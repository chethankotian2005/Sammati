// The notification centre (N-05, W-11) as state. Live: an alert frame lands at the top of the list and raises a phone
// notification; a reconnect refetches what a dropped socket missed; offline, the last known list stays. The phone also
// schedules the reminders for consents it already knows about, so those fire with the app closed (notifications.dart).

import 'dart:async';

import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/generated/app_localizations.dart';
import 'alerts.dart';
import 'consent_providers.dart';
import 'consents.dart';
import 'consents_controller.dart';
import 'core_api.dart';
import 'notifications.dart';
import 'preferences.dart';
import 'wallet_providers.dart';

enum AlertsProblem { none, unreachable, other }

class AlertsState {
  const AlertsState({
    this.items = const [],
    this.loaded = false,
    this.loading = false,
    this.fetchFailed = false,
    this.fresh = const {},
    this.thresholdsSeconds = const [],
    this.fastExpiry = false,
    this.problem = AlertsProblem.none,
  });

  /// Newest first, as Core sends them.
  final List<AlertItem> items;
  final bool loaded;
  final bool loading;

  /// The last fetch failed: the list shown is the last known one.
  final bool fetchFailed;

  /// Alerts that arrived live and have not been looked at: they get the brief colour wash.
  final Set<String> fresh;
  final List<int> thresholdsSeconds;

  /// Core is in DEMO_FAST_EXPIRY: the notice offers a 2-minute expiry.
  final bool fastExpiry;
  final AlertsProblem problem;

  int get unread => items.where((a) => a.unread).length;

  AlertsState copyWith({
    List<AlertItem>? items,
    bool? loaded,
    bool? loading,
    bool? fetchFailed,
    Set<String>? fresh,
    List<int>? thresholdsSeconds,
    bool? fastExpiry,
    AlertsProblem? problem,
  }) =>
      AlertsState(
        items: items ?? this.items,
        loaded: loaded ?? this.loaded,
        loading: loading ?? this.loading,
        fetchFailed: fetchFailed ?? this.fetchFailed,
        fresh: fresh ?? this.fresh,
        thresholdsSeconds: thresholdsSeconds ?? this.thresholdsSeconds,
        fastExpiry: fastExpiry ?? this.fastExpiry,
        problem: problem ?? this.problem,
      );
}

class AlertsController extends Notifier<AlertsState> {
  @override
  AlertsState build() {
    ref.watch(coreUrlProvider);
    final live = ref.watch(liveEventsProvider);
    if (live != null) {
      final subs = [
        live.alertEvents.listen(_onLive),
        // A renewal answers a reminder, and a reconnect may have missed some.
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
    // The reminders follow what the wallet knows about each consent.
    ref.listen(consentsProvider.select((s) => s.snapshot), (_, snapshot) => unawaited(_schedule(snapshot)));
    Future.microtask(refresh);
    return const AlertsState(loading: true);
  }

  CoreApi get _api => ref.read(coreApiFactoryProvider)(ref.read(coreUrlProvider));

  Future<void> refresh() async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    state = state.copyWith(loading: !state.loaded);
    try {
      final snapshot = await _api.getAlerts(principal);
      state = state.copyWith(
        items: snapshot.items,
        thresholdsSeconds: snapshot.thresholdsSeconds,
        fastExpiry: snapshot.fastExpiry,
        loaded: true,
        loading: false,
        fetchFailed: false,
        fresh: state.fresh.intersection({for (final a in snapshot.items) a.id}),
      );
      unawaited(_schedule(ref.read(consentsProvider).snapshot));
    } on CoreException {
      state = state.copyWith(loading: false, fetchFailed: true);
    }
  }

  void _onLive(AlertItem item) {
    if (state.items.any((a) => a.id == item.id)) return;
    state = state.copyWith(items: [item, ...state.items], fresh: {...state.fresh, item.id}, loaded: true);
    unawaited(_raise(item));
  }

  /// The wash has played; the item is an ordinary one from now on.
  void settle(String id) {
    if (!state.fresh.contains(id)) return;
    state = state.copyWith(fresh: {...state.fresh}..remove(id));
  }

  // ------------------------------------------------------------ what the customer does

  void _replace(AlertItem updated) {
    state = state.copyWith(items: [for (final a in state.items) a.id == updated.id ? updated : a]);
  }

  int _now() => ref.read(clockProvider)().millisecondsSinceEpoch ~/ 1000;

  /// Reading an alert (opening it or acting on it). Quiet on failure: the dot just stays until the next refresh.
  Future<void> markRead(AlertItem item) async {
    if (!item.unread) return;
    _replace(item.copyWith(readAt: _now()));
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    try {
      await _api.updateAlert(principal, item.id, read: true);
    } on CoreException {
      // the next refresh settles it
    }
  }

  Future<void> markAllRead() async {
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    final at = _now();
    state = state.copyWith(items: [for (final a in state.items) a.unread ? a.copyWith(readAt: at) : a]);
    try {
      await _api.markAllAlertsRead(principal);
    } on CoreException {
      // the next refresh settles it
    }
  }

  /// "Let expire" and "View proof" record the choice (and read it); they change no consent.
  Future<void> record(AlertItem item, AlertAction action) async {
    state = state.copyWith(problem: AlertsProblem.none);
    _replace(item.copyWith(readAt: item.readAt ?? _now(), actionTaken: item.actionTaken ?? action));
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return;
    try {
      await _api.updateAlert(principal, item.id, read: true, action: action);
    } on CoreException catch (e) {
      state = state.copyWith(problem: e.failure == CoreFailure.unreachable ? AlertsProblem.unreachable : AlertsProblem.other);
    }
  }

  /// The request id to open the consent notice (W3) with, for Renew. Null, with [AlertsState.problem] set, if Core could not make one.
  Future<String?> renewalFor({required String fiduciary, required String purposeCode}) async {
    state = state.copyWith(problem: AlertsProblem.none);
    final principal = ref.read(walletAddressProvider).value;
    if (principal == null) return null;
    try {
      return await _api.openRenewal(principal: principal, fiduciary: fiduciary, purposeCode: purposeCode);
    } on CoreException catch (e) {
      state = state.copyWith(problem: e.failure == CoreFailure.unreachable ? AlertsProblem.unreachable : AlertsProblem.other);
      return null;
    }
  }

  // ------------------------------------------------------------ the phone

  AppLocalizations get _words => lookupAppLocalizations(ref.read(localeProvider));

  String _purposeLabel(AlertItem a, ConsentsSnapshot? snapshot, Locale locale) {
    final title = snapshot?.company(a.fiduciary)?.consents.where((c) => c.code == a.purposeCode).firstOrNull?.title.forLanguage(locale.languageCode);
    return title ?? a.purposeCode ?? '';
  }

  /// An alert arrived while the app is running: raise it on the phone too.
  Future<void> _raise(AlertItem item) async {
    try {
      final t = _words;
      final locale = ref.read(localeProvider);
      await ref.read(localNotifierProvider).show(
            id: notificationIdOf(item.dedupeKey),
            title: alertTitle(t, item.type),
            body: alertSentence(t, item, _purposeLabel(item, ref.read(consentsProvider).snapshot, locale)),
            channel: t.notif_channel,
          );
    } on Object {
      // A notification that cannot be raised (no plugin on web, permission denied) must never surface as a crash.
    }
  }

  /// Asks the phone to raise each reminder at the moment Core will: before expiry at each threshold, and at expiry.
  Future<void> _schedule(ConsentsSnapshot? snapshot) async {
    if (snapshot == null || state.thresholdsSeconds.isEmpty) return;
    try {
      final notifier = ref.read(localNotifierProvider);
      final t = _words;
      final locale = ref.read(localeProvider);
      final nowSeconds = ref.read(clockProvider)().millisecondsSinceEpoch ~/ 1000;
      await notifier.cancelAll();
      for (final company in snapshot.companies) {
        for (final consent in company.consents) {
          final expiresAt = consent.expiresAt;
          if (consent.status != ConsentStatus.active || expiresAt == null || expiresAt <= nowSeconds) continue;
          final purpose = consent.title.forLanguage(locale.languageCode);
          for (final threshold in state.thresholdsSeconds) {
            final at = expiresAt - threshold;
            if (at <= nowSeconds) continue; // already inside it: Core's live alert covers this one
            final item = _planned(AlertType.expiring, company, consent, expiresAt: expiresAt, threshold: threshold, createdAt: at);
            await notifier.schedule(
              id: notificationIdOf(item.dedupeKey),
              at: DateTime.fromMillisecondsSinceEpoch(at * 1000),
              title: alertTitle(t, item.type),
              body: alertSentence(t, item, purpose),
              channel: t.notif_channel,
            );
          }
          final over = _planned(AlertType.expired, company, consent, expiresAt: expiresAt, createdAt: expiresAt);
          await notifier.schedule(
            id: notificationIdOf(over.dedupeKey),
            at: DateTime.fromMillisecondsSinceEpoch(expiresAt * 1000),
            title: alertTitle(t, over.type),
            body: alertSentence(t, over, purpose),
            channel: t.notif_channel,
          );
        }
      }
    } on Object {
      // as above: a reminder that cannot be scheduled is not worth a crash
    }
  }

  AlertItem _planned(AlertType type, CompanyConsents company, ConsentView consent, {required int expiresAt, int? threshold, required int createdAt}) => AlertItem(
        id: '',
        type: type,
        fiduciary: company.fiduciary.address,
        company: company.fiduciary.name,
        color: '',
        purposeId: consent.purposeId,
        purposeCode: consent.code,
        createdAt: createdAt,
        expiresAt: expiresAt,
        thresholdSeconds: threshold,
      );
}

final alertsProvider = NotifierProvider<AlertsController, AlertsState>(AlertsController.new);

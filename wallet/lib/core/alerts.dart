// Alerts, as the wallet sees them (trd.md §6.12, ui.md W13): expiry reminders, a company's renewal request, "your data
// was erased" and a processor's confirmation. A notification is data; the sentence is written here, in the customer's
// language, from its type and numbers. Nothing in it is the customer's own data.

import '../l10n/generated/app_localizations.dart';

enum AlertType {
  expiring('consent.expiring'),
  expired('consent.expired'),
  renewalRequested('consent.renewal_requested'),
  dataErased('data.erased'),
  cascadeAcknowledged('cascade.acknowledged');

  const AlertType(this.wire);

  /// The event name and `type` Core uses.
  final String wire;

  static AlertType? fromWire(Object? value) {
    for (final t in values) {
      if (t.wire == value) return t;
    }
    return null;
  }
}

/// What the customer did about an alert (`actionTaken`). Core sets `renewed` itself when a grant arrives.
enum AlertAction {
  renewed('renewed'),
  letExpire('let_expire'),
  viewedProof('viewed_proof');

  const AlertAction(this.wire);
  final String wire;

  static AlertAction? fromWire(Object? value) {
    for (final a in values) {
      if (a.wire == value) return a;
    }
    return null;
  }
}

class AlertItem {
  const AlertItem({
    required this.id,
    required this.type,
    required this.fiduciary,
    required this.company,
    required this.color,
    required this.purposeId,
    required this.purposeCode,
    required this.createdAt,
    this.readAt,
    this.actionTaken,
    this.expiresAt,
    this.thresholdSeconds,
    this.message,
    this.cause,
    this.processorName,
  });

  final String id;
  final AlertType type;

  /// The company's address (the notice is fetched against it) and what to call it.
  final String fiduciary;
  final String company;

  /// `#RRGGBB` as Core sends it.
  final String color;
  final String? purposeId;
  final String? purposeCode;

  /// Unix seconds.
  final int createdAt;
  final int? readAt;
  final AlertAction? actionTaken;

  /// The consent's expiry, for the three consent alerts.
  final int? expiresAt;

  /// Which reminder this was: seconds before expiry.
  final int? thresholdSeconds;

  /// What the company wrote with a renewal request: shown as "Message from {company}", never as an identity.
  final String? message;

  /// `withdrawn` or `expired`, for "data erased".
  final String? cause;
  final String? processorName;

  bool get unread => readAt == null;

  /// Renew only makes sense while the consent is still there to renew: not after it was, and not for a confirmation.
  bool get canRenew => (type == AlertType.expiring || type == AlertType.expired || type == AlertType.renewalRequested) && actionTaken == null && purposeCode != null;
  bool get canLetExpire => (type == AlertType.expiring || type == AlertType.renewalRequested) && actionTaken == null;

  AlertItem copyWith({int? readAt, AlertAction? actionTaken}) => AlertItem(
        id: id,
        type: type,
        fiduciary: fiduciary,
        company: company,
        color: color,
        purposeId: purposeId,
        purposeCode: purposeCode,
        createdAt: createdAt,
        readAt: readAt ?? this.readAt,
        actionTaken: actionTaken ?? this.actionTaken,
        expiresAt: expiresAt,
        thresholdSeconds: thresholdSeconds,
        message: message,
        cause: cause,
        processorName: processorName,
      );

  /// The same notification, whether it arrived live or was scheduled on the phone ahead of time: used as the phone
  /// notification's id, so the two replace each other instead of showing twice.
  String get dedupeKey => '${type.wire}:${fiduciary.toLowerCase()}:${(purposeId ?? '').toLowerCase()}:${expiresAt ?? 0}:${thresholdSeconds ?? 0}:${cause ?? ''}:${processorName ?? ''}';

  /// Null for a row the wallet cannot read: it is skipped, not fatal.
  static AlertItem? tryParse(Object? json) {
    try {
      final m = json as Map<String, dynamic>;
      final type = AlertType.fromWire(m['type']);
      if (type == null) return null;
      final f = m['fiduciary'] as Map<String, dynamic>;
      final p = (m['payload'] as Map<String, dynamic>?) ?? const {};
      return AlertItem(
        id: m['id'] as String,
        type: type,
        fiduciary: f['address'] as String,
        company: f['name'] as String,
        color: (f['color'] as String?) ?? '',
        purposeId: m['purposeId'] as String?,
        purposeCode: m['purposeCode'] as String?,
        createdAt: m['createdAt'] as int,
        readAt: m['readAt'] as int?,
        actionTaken: AlertAction.fromWire(m['actionTaken']),
        expiresAt: p['expiresAt'] as int?,
        thresholdSeconds: p['thresholdSeconds'] as int?,
        message: p['message'] as String?,
        cause: p['cause'] as String?,
        processorName: p['processorName'] as String?,
      );
    } on Object {
      return null;
    }
  }

  /// A `consent.expiring` (and the other four) WebSocket frame: `{ event, principal, notification, at }`.
  static AlertItem? tryParseEvent(Object? decoded) {
    if (decoded is! Map<String, dynamic> || AlertType.fromWire(decoded['event']) == null) return null;
    final item = tryParse(decoded['notification']);
    return item != null && item.type.wire == decoded['event'] ? item : null;
  }
}

/// `GET /v1/principals/:addr/notifications`.
class AlertsSnapshot {
  const AlertsSnapshot({required this.items, required this.thresholdsSeconds, required this.fastExpiry});

  /// Newest first, as Core sends them.
  final List<AlertItem> items;

  /// Seconds before expiry at which Core raises reminders: the phone schedules its own at the same moments.
  final List<int> thresholdsSeconds;

  /// Core runs with `DEMO_FAST_EXPIRY`: the notice offers a 2-minute expiry.
  final bool fastExpiry;
}

// --- the words ---

/// "3 days", "1 hour", "45 seconds": the largest unit that is at least one, rounded.
String durationText(AppLocalizations t, int seconds) {
  if (seconds >= 86400) return t.duration_days((seconds / 86400).round());
  if (seconds >= 3600) return t.duration_hours((seconds / 3600).round());
  if (seconds >= 60) return t.duration_minutes((seconds / 60).round());
  return t.duration_seconds(seconds < 1 ? 1 : seconds);
}

/// The sentence for an alert. [purpose] is the title in the customer's language, or the code if the wallet does not know it.
String alertSentence(AppLocalizations t, AlertItem a, String purpose) {
  switch (a.type) {
    case AlertType.expiring:
      // What was true when it was raised, so the sentence does not change as the clock runs.
      final left = (a.expiresAt ?? a.createdAt) - a.createdAt;
      return t.alert_expiring(purpose, a.company, durationText(t, left));
    case AlertType.expired:
      return t.alert_expired(purpose, a.company);
    case AlertType.renewalRequested:
      return t.alert_renewal(a.company, purpose);
    case AlertType.dataErased:
      return a.cause == 'withdrawn' ? t.alert_erased_withdrawn(a.company, purpose) : t.alert_erased_expired(a.company, purpose);
    case AlertType.cascadeAcknowledged:
      return t.alert_cascade(a.processorName ?? a.company, purpose);
  }
}

/// The phone notification's headline.
String alertTitle(AppLocalizations t, AlertType type) => switch (type) {
      AlertType.expiring => t.notif_expiring_title,
      AlertType.expired => t.notif_expired_title,
      AlertType.renewalRequested => t.notif_renewal_title,
      AlertType.dataErased => t.notif_erased_title,
      AlertType.cascadeAcknowledged => t.notif_cascade_title,
    };

// One data access by a company, as the wallet shows it (W6). Built from the REST
// feed (trd.md §6.1 `/activity`) and from the live `access.logged` event (§6.5).

enum Decision {
  allowed,
  blocked;

  static Decision? parse(Object? value) => switch (value) {
        'ALLOWED' => allowed,
        'BLOCKED' => blocked,
        _ => null,
      };
}

class ActivityItem {
  const ActivityItem({
    required this.id,
    required this.fiduciary,
    required this.fiduciaryName,
    required this.purposeCode,
    required this.decision,
    required this.reason,
    required this.at,
    this.arrivedAt,
  });

  /// From an `/activity` row. Null if it is not a row we understand.
  static ActivityItem? tryParseRow(Object? json) => _tryParse(json, idKey: 'id');

  /// From a WebSocket `access.logged` payload. Null for any other event type.
  /// [arrivedAt] marks it as live, which is what earns it the arrival animation.
  static ActivityItem? tryParseEvent(Object? json, {required DateTime arrivedAt}) {
    if (json is! Map<String, dynamic> || json['event'] != 'access.logged') return null;
    return _tryParse(json, idKey: 'entryId', arrivedAt: arrivedAt);
  }

  static ActivityItem? _tryParse(Object? json, {required String idKey, DateTime? arrivedAt}) {
    if (json is! Map<String, dynamic>) return null;
    final decision = Decision.parse(json['decision']);
    final id = json[idKey];
    final fiduciary = json['fiduciary'];
    final name = json['fiduciaryName'];
    final code = json['purposeCode'];
    final reason = json['reason'];
    final at = json['at'];
    if (decision == null ||
        id is! String ||
        fiduciary is! String ||
        name is! String ||
        code is! String ||
        reason is! String ||
        at is! int) {
      return null;
    }
    return ActivityItem(
      id: id,
      fiduciary: fiduciary,
      fiduciaryName: name,
      purposeCode: code,
      decision: decision,
      reason: reason,
      at: at,
      arrivedAt: arrivedAt,
    );
  }

  final String id;
  final String fiduciary;
  final String fiduciaryName;
  final String purposeCode;
  final Decision decision;

  /// `OK`, or one of the five reason codes (AGENTS.md).
  final String reason;

  /// Unix seconds.
  final int at;

  /// Set only for rows that arrived over the socket in this session.
  final DateTime? arrivedAt;
}

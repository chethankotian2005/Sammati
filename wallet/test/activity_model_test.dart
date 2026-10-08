import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/activity.dart';

import 'support/fake_core.dart';

Map<String, dynamic> row({String id = 'e1', String decision = 'ALLOWED', String reason = 'OK'}) => {
      'id': id,
      'seq': 7,
      'fiduciary': fiduciaryAddress,
      'fiduciaryName': 'QuickLoan',
      'purposeCode': 'credit_check',
      'decision': decision,
      'reason': reason,
      'endpoint': 'GET /customers/:id/credit-profile',
      'at': 1760000000,
      'anchored': false,
    };

Map<String, dynamic> event({String decision = 'BLOCKED', String reason = 'CONSENT_WITHDRAWN'}) => {
      'event': 'access.logged',
      'principal': '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      'fiduciary': fiduciaryAddress,
      'fiduciaryName': 'QuickLoan',
      'entryId': 'e9',
      'seq': 9,
      'purposeCode': 'marketing',
      'decision': decision,
      'reason': reason,
      'endpoint': 'GET /x',
      'at': 1760000005,
    };

void main() {
  final arrived = DateTime.utc(2025, 10, 9);

  group('ActivityItem.tryParseRow (the /activity feed)', () {
    test('reads a row', () {
      final item = ActivityItem.tryParseRow(row())!;
      expect(item.id, 'e1');
      expect(item.decision, Decision.allowed);
      expect(item.reason, 'OK');
      expect(item.purposeCode, 'credit_check');
      expect(item.at, 1760000000);
      expect(item.arrivedAt, isNull, reason: 'a fetched row is not "new"');
    });

    test('reads a blocked row with its reason code', () {
      final item = ActivityItem.tryParseRow(row(decision: 'BLOCKED', reason: 'CONSENT_EXPIRED'))!;
      expect(item.decision, Decision.blocked);
      expect(item.reason, 'CONSENT_EXPIRED');
    });

    for (final (label, change) in <(String, Map<String, dynamic>)>[
      ('an unknown decision', {'decision': 'MAYBE'}),
      ('a missing id', {'id': null}),
      ('a numeric purpose code', {'purposeCode': 5}),
      ('a missing timestamp', {'at': null}),
    ]) {
      test('skips a row with $label', () => expect(ActivityItem.tryParseRow({...row(), ...change}), isNull));
    }

    test('skips things that are not objects', () => expect(ActivityItem.tryParseRow('x'), isNull));
  });

  group('ActivityItem.tryParseEvent (access.logged)', () {
    test('reads the event, using entryId as the id, and stamps its arrival', () {
      final item = ActivityItem.tryParseEvent(event(), arrivedAt: arrived)!;
      expect(item.id, 'e9');
      expect(item.decision, Decision.blocked);
      expect(item.purposeCode, 'marketing');
      expect(item.arrivedAt, arrived);
    });

    test('ignores other event types', () {
      expect(ActivityItem.tryParseEvent({...event(), 'event': 'consent.updated'}, arrivedAt: arrived), isNull);
    });

    test('ignores a malformed event', () {
      expect(ActivityItem.tryParseEvent({...event(), 'seq': 'x', 'at': 'soon'}, arrivedAt: arrived), isNull);
    });
  });
}

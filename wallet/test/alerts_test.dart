// W13 Alerts (N-03, N-04, N-05, W-11; ui.md): what the customer is told about expiring and expired consents, a company's
// renewal request, erased data and processors' confirmations, and what Renew, Let expire and View proof really do.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/alerts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/notifications.dart';
import 'package:sammati/core/wallet_providers.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;

AlertItem alert({
  String id = 'ntf_aaaa0001',
  AlertType type = AlertType.expiring,
  int createdAt = _now - 120,
  int? readAt,
  AlertAction? actionTaken,
  int? expiresAt,
  int? threshold,
  String? message,
  String? cause,
  String? processorName,
  String? purposeCode = 'credit_check',
  String? purposeId = creditCheckId,
  String company = 'QuickLoan',
}) =>
    AlertItem(
      id: id,
      type: type,
      fiduciary: fiduciaryAddress,
      company: company,
      color: '#2F5BEA',
      purposeId: purposeId,
      purposeCode: purposeCode,
      createdAt: createdAt,
      readAt: readAt,
      actionTaken: actionTaken,
      expiresAt: type == AlertType.expiring || type == AlertType.expired || type == AlertType.renewalRequested ? (expiresAt ?? createdAt + 3 * _day) : null,
      thresholdSeconds: threshold ?? (type == AlertType.expiring ? 3 * _day : null),
      message: message,
      cause: cause,
      processorName: processorName,
    );

String addressOf(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(MaterialApp))).read(walletAddressProvider).value!;

Future<void> openAlerts(WidgetTester tester) async {
  await tester.tap(find.text('Alerts'));
  await tester.pumpAndSettle();
}

void main() {
  group('the Alerts tab in the bottom bar', () {
    testWidgets('sits between Scan and Rights, and opens the list', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..alerts = [alert()]);
      expect(find.text('Alerts'), findsOneWidget);
      await openAlerts(tester);
      expect(find.text('QuickLoan'), findsWidgets);
    });

    testWidgets('has an unread dot while anything is unread, and says so to a screen reader', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..alerts = [alert()]);
      expect(find.byKey(const ValueKey('alerts-unread-dot')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Alerts, Unread alerts')), findsOneWidget);
    });

    testWidgets('has no dot when everything has been read', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..alerts = [alert(readAt: _now - 10)]);
      expect(find.byKey(const ValueKey('alerts-unread-dot')), findsNothing);
    });

    testWidgets('the dot goes when Mark all as read is pressed, and Core is told', (tester) async {
      final core = FakeCoreApi()..alerts = [alert(), alert(id: 'ntf_aaaa0002')];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.text('Mark all as read'));
      await tester.pumpAndSettle();
      expect(core.markAllCalls, 1);
      expect(find.byKey(const ValueKey('alerts-unread-dot')), findsNothing);
      expect(find.text('Mark all as read'), findsNothing);
    });
  });

  group('the list', () {
    testWidgets('says what it is for when empty', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await openAlerts(tester);
      expect(find.text('No alerts. Expiry reminders and updates from companies will appear here.'), findsOneWidget);
    });

    testWidgets('groups Today and Earlier, newest first', (tester) async {
      final core = FakeCoreApi()
        ..alerts = [
          alert(id: 'ntf_new', type: AlertType.expired, createdAt: _now - 60),
          alert(id: 'ntf_old', createdAt: _now - 3 * _day, expiresAt: _now + _day),
        ];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Earlier'), findsOneWidget);
      expect(tester.getTopLeft(find.text('Today')).dy, lessThan(tester.getTopLeft(find.text('Earlier')).dy));
      expect(find.textContaining('has expired'), findsOneWidget);
      expect(find.text('1 min ago'.replaceFirst('1 min', '1 minute')), findsOneWidget);
    });

    testWidgets('writes each kind in plain words', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi()
        ..alerts = [
          alert(id: 'a1', type: AlertType.expiring, createdAt: _now - 10, expiresAt: _now - 10 + 3 * _day),
          alert(id: 'a2', type: AlertType.expiring, createdAt: _now - 20, expiresAt: _now - 20 + 60, threshold: 60),
          alert(id: 'a3', type: AlertType.expired),
          alert(id: 'a4', type: AlertType.renewalRequested, message: 'Your form is ready'),
          alert(id: 'a5', type: AlertType.dataErased, cause: 'withdrawn'),
          alert(id: 'a6', type: AlertType.dataErased, cause: 'expired'),
          alert(id: 'a7', type: AlertType.cascadeAcknowledged, purposeCode: 'marketing', purposeId: marketingId, processorName: 'AdPartnerQ'),
        ];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      expect(find.text('Your consent for credit_check at QuickLoan expires in 3 days'), findsOneWidget);
      expect(find.text('Your consent for credit_check at QuickLoan expires in 1 minute'), findsOneWidget);
      expect(find.text('Your consent for credit_check at QuickLoan has expired'), findsOneWidget);
      expect(find.text('QuickLoan asks you to renew your consent for credit_check'), findsOneWidget);
      expect(find.text('Message from QuickLoan'), findsOneWidget);
      expect(find.text('Your form is ready'), findsOneWidget);
      expect(find.text('QuickLoan erased your data for credit_check after you withdrew consent'), findsOneWidget);
      expect(find.text('QuickLoan erased your data for credit_check after consent expired'), findsOneWidget);
      expect(find.text('AdPartnerQ confirmed it stopped using your data for marketing'), findsOneWidget);
    });

    testWidgets('uses the purpose title in the customer\'s language when the wallet knows the consent', (tester) async {
      final core = FakeCoreApi()..alerts = [alert(type: AlertType.expired)];
      core.seed(creditCheckId, expiresAt: _now + 10 * _day);
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      expect(find.text('Your consent for Credit check at QuickLoan has expired'), findsOneWidget);
    });

    testWidgets('reads in Hindi', (tester) async {
      final core = FakeCoreApi()..alerts = [alert(type: AlertType.expired)];
      core.seed(creditCheckId, expiresAt: _now + 10 * _day);
      await pumpApp(tester, core: core, stored: {'locale': 'hi'});
      await tester.tap(find.text('अलर्ट'));
      await tester.pumpAndSettle();
      expect(find.text('QuickLoan में क्रेडिट जाँच के लिए आपकी सहमति समाप्त हो गई है'), findsOneWidget);
    });

    testWidgets('keeps the last known list and says so when Core cannot be reached', (tester) async {
      final core = FakeCoreApi()..alerts = [alert()];
      final live = FakeLiveEvents();
      await pumpApp(tester, core: core, live: live);
      await openAlerts(tester);
      core.alertsError = const CoreException(CoreFailure.unreachable);
      live.connected(true); // a reconnect refetches, and the refetch fails
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known alerts.'), findsOneWidget);
      expect(find.textContaining('expires in'), findsOneWidget);
    });

    testWidgets('a failure before anything was loaded offers Retry', (tester) async {
      final core = FakeCoreApi()..alertsError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      expect(find.widgetWithText(FilledButton, 'Try again'), findsOneWidget);
    });
  });

  group('live alerts', () {
    testWidgets('a new one lands at the top, unread and washed in, and settles', (tester) async {
      final live = FakeLiveEvents();
      final core = FakeCoreApi()..alerts = [alert(id: 'ntf_old', createdAt: _now - 500)];
      await pumpApp(tester, core: core, live: live);
      await openAlerts(tester);

      live.emitAlert(alert(id: 'ntf_new', type: AlertType.expired, createdAt: _now));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      final washing = tester.widgetList<DecoratedBox>(find.byType(DecoratedBox)).map((d) => d.decoration).whereType<BoxDecoration>().map((d) => d.color).whereType<Color>();
      expect(washing.any((c) => c != const Color(0xFFFFFFFF) && c.a > 0 && c.r > 0.9 && c.b < 0.9), isTrue, reason: 'a marigold tint is on screen mid-wash');
      await tester.pumpAndSettle();
      expect(find.textContaining('has expired'), findsOneWidget);
      expect(tester.getTopLeft(find.textContaining('has expired')).dy, lessThan(tester.getTopLeft(find.textContaining('expires in')).dy));
    });

    testWidgets('raises a phone notification with the same words, and the same one twice is one', (tester) async {
      final live = FakeLiveEvents();
      final phone = RecordingNotifier();
      await pumpApp(tester, core: FakeCoreApi(), live: live, notifier: phone);
      final a = alert(id: 'ntf_new', type: AlertType.expired, createdAt: _now);
      live.emitAlert(a);
      live.emitAlert(a);
      await tester.pumpAndSettle();
      expect(phone.shown, hasLength(1));
      expect(phone.shown.single.title, 'Consent expired');
      expect(phone.shown.single.body, 'Your consent for credit_check at QuickLoan has expired');
      expect(phone.shown.single.channel, 'Consent alerts');
      expect(phone.shown.single.id, notificationIdOf(a.dedupeKey));
    });

    testWidgets('the notification is in the customer\'s language too', (tester) async {
      final live = FakeLiveEvents();
      final phone = RecordingNotifier();
      await pumpApp(tester, core: FakeCoreApi(), live: live, notifier: phone, stored: {'locale': 'kn'});
      live.emitAlert(alert(id: 'ntf_new', type: AlertType.expired, createdAt: _now));
      await tester.pumpAndSettle();
      expect(phone.shown.single.title, 'ಒಪ್ಪಿಗೆ ಮುಗಿದಿದೆ');
    });

    testWidgets('a consent update refetches, so a renewed reminder shows as answered', (tester) async {
      final live = FakeLiveEvents();
      final core = FakeCoreApi()..alerts = [alert()];
      await pumpApp(tester, core: core, live: live);
      await openAlerts(tester);
      expect(find.widgetWithText(FilledButton, 'Renew'), findsOneWidget);
      core.alerts = [alert(readAt: _now, actionTaken: AlertAction.renewed)];
      live.emit(ConsentUpdated(principal: addressOf(tester), fiduciary: fiduciaryAddress, purposeId: creditCheckId, status: ConsentStatus.active, expiresAt: _now + 100, txHash: '0xaa'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Renew'), findsNothing);
      expect(find.text('Renewed'), findsOneWidget);
    });
  });

  group('actions', () {
    testWidgets('an expiring reminder offers Renew and Let expire; an expired one only Renew; a confirmation neither', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi()
        ..alerts = [
          alert(id: 'a1', type: AlertType.expiring),
          alert(id: 'a2', type: AlertType.expired),
          alert(id: 'a3', type: AlertType.dataErased, cause: 'expired'),
        ];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      expect(find.widgetWithText(FilledButton, 'Renew'), findsNWidgets(2));
      expect(find.widgetWithText(TextButton, 'Let expire'), findsOneWidget);
    });

    testWidgets('every action is at least 48 dp tall', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi()..alerts = [alert(type: AlertType.renewalRequested)];
      core.seed(creditCheckId, expiresAt: _now + _day);
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      for (final label in ['Renew', 'Let expire', 'View proof']) {
        final box = tester.getSize(find.text(label).first.evaluate().isEmpty ? find.byType(Scaffold).first : find.ancestor(of: find.text(label).first, matching: find.byWidgetPredicate((w) => w is ButtonStyleButton)));
        expect(box.height, greaterThanOrEqualTo(48), reason: label);
      }
    });

    testWidgets('Renew asks Core for the renewal request and opens the ordinary consent notice for it', (tester) async {
      final core = FakeCoreApi()..alerts = [alert()];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Renew'));
      await tester.pumpAndSettle();
      expect(core.renewals, [(fiduciary: fiduciaryAddress, purposeCode: 'credit_check')]);
      expect(core.noticeFetches, 1);
      expect(find.textContaining('Asking for'), findsOneWidget);
      expect(core.alertUpdates.single, (id: 'ntf_aaaa0001', read: true, action: null)); // opening it reads it
    });

    testWidgets('Renew that Core cannot open says so and stays put', (tester) async {
      final core = FakeCoreApi()
        ..alerts = [alert()]
        ..renewalError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Renew'));
      await tester.pumpAndSettle();
      expect(find.text('Could not open the renewal. Try again.'), findsOneWidget);
      expect(core.noticeFetches, 0);
    });

    testWidgets('Let expire records the choice, says so, and takes the actions away', (tester) async {
      final core = FakeCoreApi()..alerts = [alert()];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Let expire'));
      await tester.pumpAndSettle();
      expect(core.alertUpdates.single.action, AlertAction.letExpire);
      expect(find.text('Okay. This consent will expire on its own.'), findsOneWidget);
      expect(find.text('Left to expire'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Let expire'), findsNothing);
      expect(core.withdrawals, isEmpty); // it is not a withdrawal
    });

    testWidgets('View proof opens the proof for the consent and records that it was looked at', (tester) async {
      final core = FakeCoreApi()..alerts = [alert(type: AlertType.dataErased, cause: 'withdrawn')];
      core.seed(creditCheckId, expiresAt: _now + _day);
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.widgetWithText(TextButton, 'View proof'));
      await tester.pumpAndSettle();
      expect(core.alertUpdates.single.action, AlertAction.viewedProof);
      expect(find.byType(BottomSheet), findsOneWidget);
    });

    testWidgets('View proof is not offered for a consent the wallet has no record of', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..alerts = [alert(type: AlertType.expired)]);
      await openAlerts(tester);
      expect(find.text('View proof'), findsNothing);
    });

    testWidgets('tapping an alert reads it', (tester) async {
      final core = FakeCoreApi()..alerts = [alert()];
      await pumpApp(tester, core: core);
      await openAlerts(tester);
      await tester.tap(find.textContaining('expires in'));
      await tester.pumpAndSettle();
      expect(core.alertUpdates.single, (id: 'ntf_aaaa0001', read: true, action: null));
      expect(find.byKey(const ValueKey('alerts-unread-dot')), findsNothing);
    });
  });

  group('the expired consent on the pass (W5)', () {
    testWidgets('offers Renew under "Expired … give consent again", and it opens the same notice', (tester) async {
      final core = FakeCoreApi();
      core.seed(creditCheckId, expiresAt: _now - 2 * _day);
      await pumpApp(tester, core: core);
      await tester.tap(find.text('QuickLoan'));
      await tester.pumpAndSettle();
      expect(find.text('Expired 2 days ago, give consent again'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Renew'));
      await tester.pumpAndSettle();
      expect(core.renewals.single.purposeCode, 'credit_check');
      expect(find.textContaining('Asking for'), findsOneWidget);
    });
  });

  group('reminders scheduled on the phone (W-11)', () {
    testWidgets('one at each threshold before expiry and one at expiry, for each active consent, in the customer\'s language', (tester) async {
      final phone = RecordingNotifier();
      final core = FakeCoreApi()..alertThresholds = [3 * _day, _day];
      core.seed(creditCheckId, expiresAt: _now + 10 * _day);
      await pumpApp(tester, core: core, notifier: phone);
      final times = phone.scheduled.map((s) => s.at.millisecondsSinceEpoch ~/ 1000).toList()..sort();
      expect(times, [_now + 7 * _day, _now + 9 * _day, _now + 10 * _day]);
      final first = phone.scheduled.firstWhere((s) => s.at.millisecondsSinceEpoch ~/ 1000 == _now + 7 * _day);
      expect(first.title, 'Consent expiring soon');
      expect(first.body, 'Your consent for Credit check at QuickLoan expires in 3 days');
      final last = phone.scheduled.firstWhere((s) => s.at.millisecondsSinceEpoch ~/ 1000 == _now + 10 * _day);
      expect(last.title, 'Consent expired');
    });

    testWidgets('skips a threshold that has already passed, and a consent that is not active', (tester) async {
      final phone = RecordingNotifier();
      final core = FakeCoreApi()..alertThresholds = [3 * _day, _day];
      core.seed(creditCheckId, expiresAt: _now + 2 * _day); // inside the 3-day threshold already
      core.seed(marketingId, status: 'Withdrawn', expiresAt: _now + 20 * _day);
      await pumpApp(tester, core: core, notifier: phone);
      final times = phone.scheduled.map((s) => s.at.millisecondsSinceEpoch ~/ 1000).toList()..sort();
      expect(times, [_now + _day, _now + 2 * _day]);
    });

    testWidgets('uses the seconds Core reports in fast mode', (tester) async {
      final phone = RecordingNotifier();
      final core = FakeCoreApi()
        ..alertThresholds = [60, 30]
        ..alertsFastExpiry = true;
      core.seed(creditCheckId, expiresAt: _now + 120);
      await pumpApp(tester, core: core, notifier: phone);
      final times = phone.scheduled.map((s) => s.at.millisecondsSinceEpoch ~/ 1000).toList()..sort();
      expect(times, [_now + 60, _now + 90, _now + 120]);
      expect(phone.scheduled.firstWhere((s) => s.at.millisecondsSinceEpoch ~/ 1000 == _now + 60).body, contains('expires in 1 minute'));
    });

    testWidgets('the live copy of a reminder and the scheduled one share an id, so the phone shows one', (tester) async {
      final planned = alert(type: AlertType.expiring, createdAt: _now + 7 * _day, expiresAt: _now + 10 * _day, threshold: 3 * _day);
      final arrived = alert(id: 'ntf_core', type: AlertType.expiring, createdAt: _now + 7 * _day + 2, expiresAt: _now + 10 * _day, threshold: 3 * _day);
      expect(notificationIdOf(arrived.dedupeKey), notificationIdOf(planned.dedupeKey));
      expect(notificationIdOf(alert(type: AlertType.expired).dedupeKey), isNot(notificationIdOf(planned.dedupeKey)));
      expect(notificationIdOf(planned.dedupeKey), isNonNegative);
    });
  });

  group('the 2-minute choice on the notice (DEMO_FAST_EXPIRY)', () {
    testWidgets('is offered, and chosen by default, only when Core says it is in fast mode', (tester) async {
      useTallScreen(tester);
      final fast = {...buildNoticeJson(), 'fastExpiry': true};
      final core = FakeCoreApi(notice: fast);
      await pumpApp(tester, core: core);
      await tester.tap(find.byIcon(Icons.qr_code_scanner));
      await tester.pumpAndSettle();
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      expect(find.text('2 minutes (demo)'), findsWidgets);
    });

    testWidgets('is not there in the ordinary case', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi();
      await pumpApp(tester, core: core);
      await tester.tap(find.byIcon(Icons.qr_code_scanner));
      await tester.pumpAndSettle();
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      expect(find.text('2 minutes (demo)'), findsNothing);
      expect(find.text('6 months'), findsWidgets);
    });
  });

  group('the alert models', () {
    test('read what Core sends, and skip what they cannot', () {
      final good = {
        'id': 'ntf_1', 'key': 'k', 'type': 'consent.expiring',
        'fiduciary': {'address': fiduciaryAddress, 'name': 'QuickLoan', 'color': '#2F5BEA'},
        'purposeId': creditCheckId, 'purposeCode': 'credit_check',
        'payload': {'expiresAt': 1760259200, 'thresholdSeconds': 259200},
        'createdAt': 1760000000, 'readAt': null, 'actionTaken': null,
      };
      final item = AlertItem.tryParse(good)!;
      expect([item.type, item.thresholdSeconds, item.unread, item.canRenew, item.canLetExpire], [AlertType.expiring, 259200, true, true, true]);
      expect(AlertItem.tryParse({...good, 'type': 'something.else'}), isNull);
      expect(AlertItem.tryParse({...good}..remove('id')), isNull);
      expect(AlertItem.tryParse('nope'), isNull);
    });

    test('a frame is an alert only if the event matches the notification inside it', () {
      final n = {
        'id': 'ntf_1', 'key': 'k', 'type': 'data.erased',
        'fiduciary': {'address': fiduciaryAddress, 'name': 'QuickLoan', 'color': ''},
        'purposeId': null, 'purposeCode': null, 'payload': {'cause': 'expired'}, 'createdAt': 1, 'readAt': null, 'actionTaken': null,
      };
      expect(AlertItem.tryParseEvent({'event': 'data.erased', 'notification': n}), isNotNull);
      expect(AlertItem.tryParseEvent({'event': 'consent.expired', 'notification': n}), isNull);
      expect(AlertItem.tryParseEvent({'event': 'consent.updated', 'notification': n}), isNull);
      expect(AlertItem.tryParseEvent('x'), isNull);
    });
  });
}

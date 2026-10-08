import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/core_api.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

/// Opens the scanner and reads [button]; leaves the app wherever that leads.
Future<void> scan(WidgetTester tester, {String button = 'read valid qr'}) async {
  await tester.tap(find.byIcon(Icons.qr_code_scanner));
  await tester.pumpAndSettle();
  await tester.tap(find.text(button));
  await tester.pumpAndSettle();
}

Finder giveConsent(String label) => find.widgetWithText(FilledButton, label);

Future<void> toggle(WidgetTester tester, int index) async {
  await tester.tap(find.byType(Switch).at(index));
  await tester.pumpAndSettle();
}

void main() {
  group('W2 scan', () {
    testWidgets('a console QR opens the consent notice', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester);
      expect(find.text('Asking for 3 purposes'), findsOneWidget);
      expect(find.text('QuickLoan'), findsWidgets);
    });

    testWidgets('something that is not a Sammati QR stays on the scanner and says so', (tester) async {
      await pumpApp(tester);
      await scan(tester, button: 'read other json');
      expect(find.text('This is not a Sammati QR code.'), findsOneWidget);
      expect(find.text('read valid qr'), findsOneWidget, reason: 'still scanning');

      await tester.tap(find.text('read junk'));
      await tester.pumpAndSettle();
      expect(find.text('read valid qr'), findsOneWidget);
    });

    testWidgets('a Sammati QR is still accepted after a bad one', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester, button: 'read junk');
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      expect(find.text('Asking for 3 purposes'), findsOneWidget);
    });
  });

  group('W3 notice', () {
    testWidgets('shows each purpose with nothing pre-ticked and the button disabled', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester);

      expect(find.text('Credit check'), findsOneWidget);
      expect(find.text('About Credit check'), findsOneWidget);
      expect(find.text('PAN'), findsOneWidget);
      expect(find.text('kept for 12 months'), findsOneWidget);
      expect(find.text('kept for 6 months'), findsOneWidget);
      expect(find.text('kept for 30 days'), findsOneWidget);
      expect(find.text('You can withdraw any purpose later, as easily as you gave it.'), findsOneWidget);

      for (final s in tester.widgetList<Switch>(find.byType(Switch))) {
        expect(s.value, isFalse);
      }
      expect(tester.widget<FilledButton>(giveConsent('Give consent')).onPressed, isNull);
    });

    testWidgets('flags third-party sharing and required purposes with text, not colour alone', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester);
      expect(find.text('Shared with third parties'), findsOneWidget, reason: 'only the marketing purpose shares');
      expect(find.text('Needed for the service'), findsOneWidget, reason: 'only the identity check is required');
    });

    testWidgets('a required purpose is still off until the user turns it on', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester);
      expect(tester.widget<Switch>(find.byType(Switch).at(2)).value, isFalse);
    });

    testWidgets('shows the sector when Core provides one', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: FakeCoreApi(notice: buildNoticeJson(sector: 'Fintech lending')));
      await scan(tester);
      expect(find.text('Fintech lending'), findsOneWidget);
    });

    testWidgets('button counts the purposes switched on', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await scan(tester);

      await toggle(tester, 0);
      expect(giveConsent('Give consent (1)'), findsOneWidget);
      await toggle(tester, 1);
      expect(giveConsent('Give consent (2)'), findsOneWidget);
      await toggle(tester, 0);
      expect(giveConsent('Give consent (1)'), findsOneWidget);
    });

    testWidgets('purpose switches have a screen-reader label naming purpose and company', (tester) async {
      useTallScreen(tester);
      final handle = tester.ensureSemantics();
      await pumpApp(tester);
      await scan(tester);
      expect(find.bySemanticsLabel(RegExp('Credit check, QuickLoan')), findsWidgets);
      handle.dispose();
    });

    testWidgets('the notice follows the chosen language', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, stored: {'locale': 'hi'});
      await scan(tester);
      expect(find.text('क्रेडिट जाँच'), findsOneWidget);
      expect(find.text('के बारे में क्रेडिट जाँच'), findsOneWidget);
      expect(find.text('3 उद्देश्यों के लिए पूछ रहे हैं'), findsOneWidget);
    });
  });

  group('giving consent', () {
    testWidgets('records the chosen purposes and shows the receipt with short tx hashes', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence();
      final core = await pumpApp(tester, presence: presence);
      await scan(tester);

      await toggle(tester, 0);
      await toggle(tester, 1);
      await tester.tap(giveConsent('Give consent (2)'));
      await tester.pumpAndSettle();

      expect(presence.prompts, hasLength(1), reason: 'one biometric prompt for both purposes');
      expect(core.grants.map((g) => g['purposeId']), [creditCheckId, marketingId]);

      expect(find.text('Recorded on the ledger'), findsOneWidget);
      expect(find.text('Credit check'), findsOneWidget);
      expect(find.text('Loan offers'), findsOneWidget);
      expect(find.text('0x0000…0001'), findsOneWidget);
      expect(find.text('0x0000…0002'), findsOneWidget);
      expect(find.text('Done'), findsOneWidget);

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('Consents'), findsWidgets);
      expect(find.byTooltip('Scan'), findsOneWidget);
    });

    testWidgets('the expiry chosen in the dropdown is what gets signed', (tester) async {
      useTallScreen(tester);
      final core = await pumpApp(tester);
      await scan(tester);

      await toggle(tester, 0);
      await tester.tap(find.text('6 months').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('1 year').last);
      await tester.pumpAndSettle();

      await tester.tap(giveConsent('Give consent (1)'));
      await tester.pumpAndSettle();
      expect((core.grants.single['expiresAt']! as int) - 1760000000, 365 * 86400);
    });

    testWidgets('declining the biometric prompt records nothing and offers a retry', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence(approve: false);
      final core = await pumpApp(tester, presence: presence);
      await scan(tester);

      await toggle(tester, 0);
      await tester.tap(giveConsent('Give consent (1)'));
      await tester.pumpAndSettle();

      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
      expect(core.grants, isEmpty);
      expect(giveConsent('Try again'), findsOneWidget);

      presence.approve = true;
      await tester.tap(giveConsent('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Recorded on the ledger'), findsOneWidget);
    });

    testWidgets('a failed transaction says so, and a retry grants only what is missing', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi()..failGrantAt = 1;
      await pumpApp(tester, core: core);
      await scan(tester);

      await toggle(tester, 0);
      await toggle(tester, 1);
      await tester.tap(giveConsent('Give consent (2)'));
      await tester.pumpAndSettle();

      expect(find.text('Could not record this. Try again.'), findsOneWidget);
      expect(core.grants, hasLength(1));
      // The one that did land is locked; only the failed one is still to do.
      expect(tester.widget<Switch>(find.byType(Switch).at(0)).onChanged, isNull);

      core.failGrantAt = -1;
      await tester.tap(giveConsent('Try again'));
      await tester.pumpAndSettle();

      expect(core.grants.map((g) => g['purposeId']), [creditCheckId, marketingId], reason: 'no purpose granted twice');
      expect(core.grants.map((g) => g['nonce']), ['0', '1']);
      expect(find.text('Recorded on the ledger'), findsOneWidget);
      expect(find.text('Credit check'), findsOneWidget, reason: 'the receipt covers both purposes');
      expect(find.text('Loan offers'), findsOneWidget);
    });

    testWidgets('losing the network while recording says to check Wi-Fi', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi()
        ..failGrantAt = 0
        ..grantError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await scan(tester);

      await toggle(tester, 0);
      await tester.tap(giveConsent('Give consent (1)'));
      await tester.pumpAndSettle();
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);
    });

    testWidgets('a notice that changes after it was shown is refused and cannot be retried', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi();
      await pumpApp(tester, core: core);
      await scan(tester);

      await toggle(tester, 0);
      final changed = buildNoticeJson();
      (changed['purposes'] as List).first['description']['en'] = 'Something else entirely';
      changed['noticeHash'] = noticeHashOf(changed);
      core.notice = changed;

      await tester.tap(giveConsent('Give consent (1)'));
      await tester.pumpAndSettle();

      expect(find.textContaining('could not be verified'), findsOneWidget);
      expect(core.grants, isEmpty);
      expect(tester.widget<FilledButton>(giveConsent('Try again')).onPressed, isNull);
    });
  });

  group('notice load errors', () {
    testWidgets('no network: says to check Wi-Fi and retries', (tester) async {
      final core = FakeCoreApi()..noticeError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await scan(tester);

      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);

      core.noticeError = null;
      useTallScreen(tester);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Asking for 3 purposes'), findsOneWidget);
    });

    testWidgets('an expired or unknown request says to ask for a new QR code, with no retry', (tester) async {
      final core = FakeCoreApi()..noticeError = const CoreException(CoreFailure.notFound, code: 'REQUEST_NOT_FOUND');
      await pumpApp(tester, core: core);
      await scan(tester);

      expect(find.text('This request is no longer valid. Ask the company for a new QR code.'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('a notice that fails its hash check is never shown', (tester) async {
      final tampered = buildNoticeJson();
      (tampered['purposes'] as List).first['description']['en'] = 'Sell your data';
      await pumpApp(tester, core: FakeCoreApi(notice: tampered));
      await scan(tester);

      expect(find.textContaining('could not be verified'), findsOneWidget);
      expect(find.text('Sell your data'), findsNothing);
      expect(find.byType(Switch), findsNothing);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('a QR naming a different company than the notice is refused', (tester) async {
      final other = buildNoticeJson();
      other['fiduciary']['address'] = '0x0000000000000000000000000000000000000001';
      other['noticeHash'] = noticeHashOf(other);
      await pumpApp(tester, core: FakeCoreApi(notice: other));
      await scan(tester);

      expect(find.textContaining('could not be verified'), findsOneWidget);
      expect(find.byType(Switch), findsNothing);
    });
  });
}

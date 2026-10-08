import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;

/// QuickLoan with three consents: credit check active for ~5 months, marketing withdrawn,
/// identity check active in the ledger but expired 3 days ago.
FakeCoreApi seededCore() => FakeCoreApi()
  ..seed(creditCheckId, expiresAt: _now + 150 * _day)
  ..seed(marketingId, status: 'Withdrawn', expiresAt: _now + 90 * _day)
  ..seed(kycId, expiresAt: _now - 3 * _day);

ConsentUpdated event(String purposeId, String status, {int? expiresAt}) => ConsentUpdated(
      principal: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      fiduciary: fiduciaryAddress,
      purposeId: purposeId,
      status: ConsentStatus.parse(status),
      expiresAt: expiresAt,
      txHash: '0xdd',
    );

Finder giveConsent(String label) => find.widgetWithText(FilledButton, label);

Future<void> openPass(WidgetTester tester) async {
  await tester.tap(find.text('QuickLoan'));
  await tester.pumpAndSettle();
}

Future<void> flipFirstSwitch(WidgetTester tester) async {
  await tester.tap(find.byType(Switch).first);
  await tester.pumpAndSettle();
}

void main() {
  group('W1 home', () {
    testWidgets('empty state when the wallet has no consents', (tester) async {
      await pumpApp(tester);
      expect(find.text('No companies yet. Scan a QR code to connect your first one.'), findsOneWidget);
    });

    testWidgets('one pass per company with each purpose\'s status, the summary and the soonest expiry', (tester) async {
      await pumpApp(tester, core: seededCore());

      expect(find.text('QuickLoan'), findsOneWidget);
      expect(find.text('Fintech lending'), findsOneWidget);
      expect(find.text('1 company · 1 active'), findsOneWidget);
      expect(find.text('Credit check'), findsOneWidget);
      expect(find.text('Loan offers'), findsOneWidget);
      expect(find.text('Identity check'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);
      expect(find.text('Withdrawn'), findsOneWidget);
      expect(find.text('Expired'), findsOneWidget);
      expect(find.text('Expires in 5 months'), findsOneWidget, reason: 'soonest expiry among ACTIVE purposes only');
    });

    testWidgets('the pass header uses the company colour', (tester) async {
      await pumpApp(tester, core: seededCore());
      expect(find.byWidgetPredicate((w) => w is Container && w.color == const Color(0xFF2F5BEA)), findsOneWidget);
    });

    testWidgets('status carries an icon as well as a colour', (tester) async {
      await pumpApp(tester, core: seededCore());
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      expect(find.byIcon(Icons.block), findsOneWidget);
      expect(find.byIcon(Icons.schedule), findsOneWidget);
    });

    testWidgets('follows the chosen language', (tester) async {
      await pumpApp(tester, core: seededCore(), stored: {'locale': 'hi'});
      expect(find.text('क्रेडिट जाँच'), findsOneWidget);
      expect(find.text('सक्रिय'), findsOneWidget);
      expect(find.text('1 कंपनियाँ · 1 सक्रिय'), findsOneWidget);
    });

    testWidgets('a first fetch that fails says to check Wi-Fi and retries', (tester) async {
      final core = seededCore()..consentsError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);

      core.consentsError = null;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('QuickLoan'), findsOneWidget);
    });
  });

  group('live status (WebSocket consent.updated)', () {
    testWidgets('a withdrawal arrives and the pass changes without a refetch', (tester) async {
      final live = FakeLiveEvents();
      final core = seededCore();
      await pumpApp(tester, core: core, live: live);
      final fetches = core.consentsFetches;
      expect(find.text('1 company · 1 active'), findsOneWidget);

      live.emit(event(creditCheckId, 'Withdrawn'));
      await tester.pumpAndSettle();

      expect(find.text('1 company · 0 active'), findsOneWidget);
      expect(find.text('Withdrawn'), findsNWidgets(2));
      expect(core.consentsFetches, fetches, reason: 'a known purpose is updated in place');
    });

    testWidgets('a grant for a purpose the screen has not seen triggers a refetch', (tester) async {
      final live = FakeLiveEvents();
      final core = FakeCoreApi()..seed(creditCheckId, expiresAt: _now + 150 * _day);
      await pumpApp(tester, core: core, live: live);
      expect(find.text('Loan offers'), findsNothing);

      core.seed(marketingId, expiresAt: _now + 150 * _day);
      live.emit(event(marketingId, 'Active', expiresAt: _now + 150 * _day));
      await tester.pumpAndSettle();

      expect(find.text('Loan offers'), findsOneWidget);
      expect(find.text('1 company · 2 active'), findsOneWidget);
    });

    testWidgets('a dropped socket shows the offline banner; reconnecting catches up and clears it', (tester) async {
      final live = FakeLiveEvents();
      final core = seededCore();
      await pumpApp(tester, core: core, live: live);
      expect(find.text('No connection. Showing last known consents.'), findsNothing);

      live.connected(false);
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known consents.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsOneWidget, reason: 'last known consents stay on screen');

      final fetches = core.consentsFetches;
      core.ledger[creditCheckId]!.status = 'Withdrawn'; // changed while the socket was down
      live.connected(true);
      await tester.pumpAndSettle();

      expect(core.consentsFetches, fetches + 1);
      expect(find.text('No connection. Showing last known consents.'), findsNothing);
      expect(find.text('1 company · 0 active'), findsOneWidget);
    });

    testWidgets('a failed refresh keeps the last known consents and the banner', (tester) async {
      final live = FakeLiveEvents();
      final core = seededCore();
      await pumpApp(tester, core: core, live: live);

      core.consentsError = const CoreException(CoreFailure.unreachable);
      live.connected(true); // triggers a refetch, which fails
      await tester.pumpAndSettle();

      expect(find.text('No connection. Showing last known consents.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsOneWidget);
      expect(find.text('Credit check'), findsOneWidget);
    });

    testWidgets('closes the socket when the wallet screen goes away', (tester) async {
      final live = FakeLiveEvents();
      await pumpApp(tester, core: seededCore(), live: live);
      expect(live.disposed, isFalse);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      expect(live.disposed, isTrue);
    });
  });

  group('W5 pass detail', () {
    testWidgets('lists each purpose with its status, expiry and a switch', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: seededCore());
      await openPass(tester);

      final switches = tester.widgetList<Switch>(find.byType(Switch)).toList();
      expect(switches.map((s) => s.value), [true, false, false]);
      expect(switches[0].onChanged, isNotNull, reason: 'active: can be switched off');
      expect(switches[1].onChanged, isNull, reason: 'withdrawn: giving consent again is a new scan');
      expect(switches[2].onChanged, isNull, reason: 'expired: same');
      expect(find.text('Expires in 5 months'), findsOneWidget);
      expect(find.text('Expired 3 days ago, give consent again'), findsOneWidget);
    });

    testWidgets('switches name the purpose and the company for screen readers', (tester) async {
      useTallScreen(tester);
      final handle = tester.ensureSemantics();
      await pumpApp(tester, core: seededCore());
      await openPass(tester);
      expect(find.bySemanticsLabel(RegExp('Credit check, QuickLoan')), findsWidgets);
      handle.dispose();
    });

    testWidgets('two taps withdraw: flip the switch, confirm in the sheet', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence();
      final core = seededCore();
      await pumpApp(tester, core: core, presence: presence);
      await openPass(tester);

      await tester.tap(find.byType(Switch).first); // tap 1
      await tester.pumpAndSettle();
      expect(find.text('Stop QuickLoan using your data for Credit check? They will be blocked right away.'), findsOneWidget);
      expect(core.withdrawals, isEmpty, reason: 'nothing happens until the sheet is confirmed');

      await tester.tap(find.text('Withdraw')); // tap 2
      await tester.pumpAndSettle();

      expect(presence.prompts, ['Confirm to withdraw consent']);
      expect(core.withdrawals, hasLength(1));
      expect(core.ledger[creditCheckId]!.status, 'Withdrawn');
      expect(find.text('Withdrawn. QuickLoan is blocked.'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);
    });

    testWidgets('the home screen shows the withdrawal as well, with no extra fetch', (tester) async {
      useTallScreen(tester);
      final core = seededCore();
      await pumpApp(tester, core: core);
      await openPass(tester);
      await flipFirstSwitch(tester);
      await tester.tap(find.text('Withdraw'));
      await tester.pumpAndSettle();

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('1 company · 0 active'), findsOneWidget);
    });

    testWidgets('Keep leaves the consent alone and signs nothing', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence();
      final core = seededCore();
      await pumpApp(tester, core: core, presence: presence);
      await openPass(tester);
      await flipFirstSwitch(tester);

      await tester.tap(find.text('Keep'));
      await tester.pumpAndSettle();

      expect(presence.prompts, isEmpty);
      expect(core.withdrawals, isEmpty);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue, reason: 'the switch snaps back');
    });

    testWidgets('dismissing the sheet is the same as Keep', (tester) async {
      useTallScreen(tester);
      final core = seededCore();
      await pumpApp(tester, core: core);
      await openPass(tester);
      await flipFirstSwitch(tester);

      await tester.tapAt(const Offset(10, 10)); // the scrim above the sheet
      await tester.pumpAndSettle();

      expect(core.withdrawals, isEmpty);
      expect(find.text('Withdraw'), findsNothing);
    });

    testWidgets('declining the biometric prompt changes nothing', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence();
      final core = seededCore();
      await pumpApp(tester, core: core, presence: presence);
      await openPass(tester);
      await flipFirstSwitch(tester);
      presence.approve = false;

      await tester.tap(find.text('Withdraw'));
      await tester.pumpAndSettle();

      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
      expect(core.withdrawals, isEmpty);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);
    });

    testWidgets('no connection while withdrawing says so, and nothing changes', (tester) async {
      useTallScreen(tester);
      final core = seededCore();
      await pumpApp(tester, core: core);
      await openPass(tester);
      await flipFirstSwitch(tester);
      core.consentsError = const CoreException(CoreFailure.unreachable);

      await tester.tap(find.text('Withdraw'));
      await tester.pumpAndSettle();

      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);
    });

    testWidgets('Core refusing the withdrawal says it could not be recorded', (tester) async {
      useTallScreen(tester);
      final core = seededCore();
      await pumpApp(tester, core: core);
      await openPass(tester);
      await flipFirstSwitch(tester);
      core.withdrawError = const CoreException(CoreFailure.server);

      await tester.tap(find.text('Withdraw'));
      await tester.pumpAndSettle();

      expect(find.text('Could not record this. Try again.'), findsOneWidget);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isTrue);
    });

    testWidgets('a purpose already withdrawn elsewhere just shows the truth', (tester) async {
      useTallScreen(tester);
      final core = seededCore();
      await pumpApp(tester, core: core);
      await openPass(tester);
      await flipFirstSwitch(tester);
      core.ledger[creditCheckId]!.status = 'Withdrawn'; // the socket never told this screen

      await tester.tap(find.text('Withdraw'));
      await tester.pumpAndSettle();

      expect(core.withdrawals, isEmpty);
      expect(find.textContaining('Could not'), findsNothing);
      expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);
    });

    testWidgets('a second tap during the withdrawal cannot sign twice', (tester) async {
      useTallScreen(tester);
      final presence = FakePresence();
      final core = seededCore();
      await pumpApp(tester, core: core, presence: presence);
      await openPass(tester);
      await flipFirstSwitch(tester);
      core.withdrawGate = Completer<void>();

      await tester.tap(find.text('Withdraw'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400)); // sheet closed, withdrawal in flight
      expect(find.byType(CircularProgressIndicator), findsOneWidget, reason: 'the first switch is now a spinner');
      expect(find.byType(Switch), findsNWidgets(2), reason: 'so it cannot be tapped again');

      core.withdrawGate!.complete();
      await tester.pumpAndSettle();
      expect(core.withdrawals, hasLength(1));
    });

    testWidgets('a withdrawal made elsewhere cuts the row live', (tester) async {
      useTallScreen(tester);
      final live = FakeLiveEvents();
      await pumpApp(tester, core: seededCore(), live: live);
      await openPass(tester);

      live.emit(event(creditCheckId, 'Withdrawn'));
      await tester.pumpAndSettle();

      expect(tester.widget<Switch>(find.byType(Switch).first).value, isFalse);
      expect(find.text('Withdrawn'), findsNWidgets(2));
    });
  });

  group('pass-cut animation', () {
    double cutWidth(WidgetTester tester) {
      // The first FractionallySizedBox is the first (credit check) row's grey cut.
      return tester.widget<FractionallySizedBox>(find.byType(FractionallySizedBox).first).widthFactor!;
    }

    testWidgets('sweeps across the row over 250 ms', (tester) async {
      useTallScreen(tester);
      final live = FakeLiveEvents();
      await pumpApp(tester, core: seededCore(), live: live);
      await openPass(tester);
      expect(cutWidth(tester), 0);

      live.emit(event(creditCheckId, 'Withdrawn'));
      await tester.pump(); // the event is delivered
      await tester.pump(); // the new state is built; the animation starts here
      await tester.pump(const Duration(milliseconds: 100));
      expect(cutWidth(tester), allOf(greaterThan(0), lessThan(1)), reason: 'mid-sweep');

      await tester.pump(const Duration(milliseconds: 200));
      expect(cutWidth(tester), 1);
    });

    testWidgets('with reduced motion the change is instant', (tester) async {
      useTallScreen(tester);
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
      final live = FakeLiveEvents();
      await pumpApp(tester, core: seededCore(), live: live);
      await openPass(tester);

      live.emit(event(creditCheckId, 'Withdrawn'));
      await tester.pump(); // one frame, no time elapsed
      await tester.pump();
      expect(cutWidth(tester), 1);
    });

    testWidgets('a row that was already withdrawn does not replay the animation', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: seededCore());
      await openPass(tester);
      final marketingRowCut = tester.widgetList<FractionallySizedBox>(find.byType(FractionallySizedBox)).toList()[1];
      expect(marketingRowCut.widthFactor, 1);
    });
  });

  group('granting then going home', () {
    testWidgets('after consent the home screen follows the Core the QR named and shows the new passes', (tester) async {
      useTallScreen(tester);
      final core = FakeCoreApi();
      await pumpApp(tester, core: core);

      await tester.tap(find.byIcon(Icons.qr_code_scanner));
      await tester.pumpAndSettle();
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch).at(0));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch).at(1));
      await tester.pumpAndSettle();
      await tester.tap(giveConsent('Give consent (2)'));
      await tester.pumpAndSettle();
      expect((await SharedPreferences.getInstance()).getString('core_url'), 'http://core.test:4000');

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      expect(find.text('QuickLoan'), findsOneWidget);
      expect(find.text('1 company · 2 active'), findsOneWidget);
    });
  });
}

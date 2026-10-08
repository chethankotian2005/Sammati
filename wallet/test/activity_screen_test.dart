import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/activity.dart';
import 'package:sammati/core/core_api.dart';

import 'support/fake_core.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _medicare = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const _day = 86400;

/// QuickLoan has consents (so titles resolve and company colours are known); the feed holds
/// an allowed credit check 5 minutes ago and, older, a blocked marketing attempt.
FakeCoreApi coreWithActivity([List<ActivityItem>? activity]) => FakeCoreApi()
  ..seed(creditCheckId, expiresAt: _now + 150 * _day)
  ..seed(marketingId, status: 'Withdrawn', expiresAt: _now + 90 * _day)
  ..activity = activity ??
      [
        activityItem('a1', Decision.allowed, _now - 300),
        activityItem('a2', Decision.blocked, _now - 3 * 3600, code: 'marketing'),
      ];

Future<void> openActivity(WidgetTester tester) async {
  await tester.tap(find.text('Activity').first);
  await tester.pumpAndSettle();
}

double top(WidgetTester tester, String text) => tester.getTopLeft(find.text(text)).dy;

/// The coloured box of the feed row with this id (the wash is its background).
Color? rowColor(WidgetTester tester, String id) {
  final container = tester.widget<Container>(
    find.descendant(of: find.byKey(ValueKey(id)), matching: find.byType(Container)).first,
  );
  return (container.decoration as BoxDecoration?)?.color;
}

void main() {
  group('feed from GET /activity', () {
    testWidgets('empty state before any access', (tester) async {
      await pumpApp(tester, core: coreWithActivity([]));
      await openActivity(tester);
      expect(find.text('No activity yet. Data access by companies will appear here.'), findsOneWidget);
    });

    testWidgets('rows show company dot, "purpose · company", decision chip and time, newest first', (tester) async {
      await pumpApp(tester, core: coreWithActivity());
      await openActivity(tester);

      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
      expect(find.text('Loan offers · QuickLoan'), findsOneWidget);
      expect(find.text('5 min ago'), findsOneWidget);
      expect(find.text('3 h ago'), findsOneWidget);
      expect(top(tester, 'Credit check · QuickLoan'), lessThan(top(tester, 'Loan offers · QuickLoan')));
      expect(
        find.byWidgetPredicate((w) => w is Container && (w.decoration as BoxDecoration?)?.color == const Color(0xFF2F5BEA) && (w.decoration as BoxDecoration?)?.shape == BoxShape.circle),
        findsNWidgets(2),
        reason: 'the company dot, in the company colour',
      );
    });

    testWidgets('the decision is text and an icon, not only colour', (tester) async {
      await pumpApp(tester, core: coreWithActivity());
      await openActivity(tester);

      expect(find.text('Allowed'), findsWidgets);
      expect(find.text('Blocked'), findsWidgets);
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
      expect(find.byIcon(Icons.block), findsOneWidget);
    });

    testWidgets('a blocked row says why, from the reason code', (tester) async {
      await pumpApp(tester, core: coreWithActivity());
      await openActivity(tester);
      expect(find.text('Consent withdrawn'), findsOneWidget);
    });

    testWidgets('all five reason codes have words, and OK needs none', (tester) async {
      final core = coreWithActivity([
        for (final (i, reason) in ['CONSENT_WITHDRAWN', 'CONSENT_EXPIRED', 'NO_CONSENT', 'LEDGER_UNAVAILABLE', 'NO_PRINCIPAL'].indexed)
          activityItem('r$i', Decision.blocked, _now - i, reason: reason),
        activityItem('ok', Decision.allowed, _now - 10),
      ]);
      useTallScreen(tester);
      await pumpApp(tester, core: core);
      await openActivity(tester);

      for (final text in [
        'Consent withdrawn',
        'Consent expired',
        'No consent given',
        'Could not check consent, so blocked',
        'Could not tell whose data this was',
      ]) {
        expect(find.text(text), findsOneWidget);
      }
    });

    testWidgets('a purpose the wallet has no consent for shows its code in words', (tester) async {
      final core = coreWithActivity([activityItem('x', Decision.blocked, _now - 5, code: 'bureau_share', reason: 'NO_CONSENT')]);
      await pumpApp(tester, core: core);
      await openActivity(tester);
      expect(find.text('Bureau share · QuickLoan'), findsOneWidget);
    });

    testWidgets('is announced to screen readers as one sentence per row', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpApp(tester, core: coreWithActivity());
      await openActivity(tester);
      expect(find.bySemanticsLabel('Credit check, QuickLoan, Allowed, 5 min ago'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('follows the chosen language', (tester) async {
      await pumpApp(tester, core: coreWithActivity(), stored: {'locale': 'hi'});
      await tester.tap(find.text('गतिविधि').first);
      await tester.pumpAndSettle();
      expect(find.text('क्रेडिट जाँच · QuickLoan'), findsOneWidget);
      expect(find.text('अनुमति दी गई'), findsWidgets);
      expect(find.text('5 मिनट पहले'), findsOneWidget);
      expect(find.text('सहमति वापस ली गई'), findsOneWidget);
    });

    testWidgets('a first fetch that fails says to check Wi-Fi and retries', (tester) async {
      final core = coreWithActivity()..activityError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await openActivity(tester);
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);

      core.activityError = null;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
    });

    testWidgets('relative times keep counting', (tester) async {
      final ticks = StreamController<DateTime>();
      addTearDown(ticks.close);
      await pumpApp(tester, core: coreWithActivity(), ticks: ticks.stream);
      await openActivity(tester);
      expect(find.text('5 min ago'), findsOneWidget);

      ticks.add(DateTime.fromMillisecondsSinceEpoch((_now + 120) * 1000, isUtc: true));
      await tester.pump();
      await tester.pump();
      expect(find.text('7 min ago'), findsOneWidget);
    });
  });

  group('live rows (WebSocket access.logged)', () {
    ActivityItem live(String id, Decision decision, {String code = 'credit_check', String? reason}) =>
        activityItem(id, decision, _now, code: code, reason: reason, arrivedAt: fixedNow());

    testWidgets('a new row appears at the top without refetching', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = coreWithActivity();
      await pumpApp(tester, core: core, live: liveEvents);
      await openActivity(tester);
      final fetches = core.activityFetches;

      liveEvents.emitAccess(live('n1', Decision.blocked, code: 'marketing'));
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();

      expect(core.activityFetches, fetches);
      expect(find.text('Just now'), findsOneWidget);
      // Two marketing rows now: the new one first, above the credit check, and the old one below it.
      final marketing = find.text('Loan offers · QuickLoan');
      expect(marketing, findsNWidgets(2));
      expect(tester.getTopLeft(marketing.first).dy, lessThan(top(tester, 'Credit check · QuickLoan')));
      expect(tester.getTopLeft(marketing.last).dy, greaterThan(top(tester, 'Credit check · QuickLoan')));
    });

    testWidgets('the same event twice makes one row', (tester) async {
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);

      liveEvents.emitAccess(live('dup', Decision.allowed));
      liveEvents.emitAccess(live('dup', Decision.allowed));
      await tester.pumpAndSettle();
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
    });

    testWidgets('a new row washes green (allowed) and fades to white', (tester) async {
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);

      liveEvents.emitAccess(live('g1', Decision.allowed));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      final start = rowColor(tester, 'g1')!;
      expect(start, isNot(Colors.white));
      expect(start.g, greaterThan(start.r), reason: 'green-tinted');

      await tester.pump(const Duration(milliseconds: 1300));
      expect(rowColor(tester, 'g1'), Colors.white);
    });

    testWidgets('a blocked row washes red', (tester) async {
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);

      liveEvents.emitAccess(live('r1', Decision.blocked));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      final tint = rowColor(tester, 'r1')!;
      expect(tint.r, greaterThan(tint.g), reason: 'red-tinted');
      await tester.pumpAndSettle();
    });

    testWidgets('rows from the fetch do not wash', (tester) async {
      await pumpApp(tester, core: coreWithActivity());
      await openActivity(tester);
      expect(rowColor(tester, 'a1'), Colors.white);
      expect(rowColor(tester, 'a2'), Colors.white);
    });

    testWidgets('an older row is not re-washed when a new one arrives above it', (tester) async {
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);
      liveEvents.emitAccess(live('first', Decision.allowed));
      await tester.pumpAndSettle();
      expect(rowColor(tester, 'first'), Colors.white);

      liveEvents.emitAccess(live('second', Decision.allowed));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(rowColor(tester, 'first'), Colors.white, reason: 'only the new row animates');
      await tester.pumpAndSettle();
    });

    testWidgets('with reduced motion a new row simply appears, with no wash', (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);

      liveEvents.emitAccess(live('m1', Decision.blocked));
      await tester.pump();
      await tester.pump();
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
      expect(rowColor(tester, 'm1'), Colors.white);
    });

    testWidgets('keeps receiving while another tab is showing', (tester) async {
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: coreWithActivity([]), live: liveEvents);
      await openActivity(tester);
      await tester.tap(find.text('Rights').first);
      await tester.pumpAndSettle();

      liveEvents.emitAccess(live('bg', Decision.allowed));
      await tester.pumpAndSettle();
      await openActivity(tester);
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
    });

    testWidgets('a dropped socket shows the banner; reconnecting fetches what was missed', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = coreWithActivity();
      await pumpApp(tester, core: core, live: liveEvents);
      await openActivity(tester);

      liveEvents.connected(false);
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known activity.'), findsOneWidget);
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);

      core.activity = [activityItem('missed', Decision.blocked, _now - 1, code: 'marketing'), ...core.activity];
      liveEvents.connected(true);
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known activity.'), findsNothing);
      expect(find.text('Loan offers · QuickLoan'), findsNWidgets(2), reason: 'the missed blocked row and the older one');
    });

    testWidgets('a failed refresh keeps the rows and the banner', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = coreWithActivity();
      await pumpApp(tester, core: core, live: liveEvents);
      await openActivity(tester);

      core.activityError = const CoreException(CoreFailure.unreachable);
      liveEvents.connected(true);
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known activity.'), findsOneWidget);
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
    });
  });

  group('filters', () {
    FakeCoreApi mixed() => coreWithActivity([
          activityItem('q1', Decision.allowed, _now - 10),
          activityItem('q2', Decision.blocked, _now - 20, code: 'marketing'),
          activityItem('m1', Decision.allowed, _now - 30, fiduciary: _medicare, name: 'MediCare+', code: 'records'),
          activityItem('m2', Decision.blocked, _now - 40, fiduciary: _medicare, name: 'MediCare+', code: 'records', reason: 'NO_CONSENT'),
        ]);

    Future<void> tapChip(WidgetTester tester, String label) async {
      await tester.tap(find.descendant(of: find.byType(ChoiceChip), matching: find.text(label)));
      await tester.pumpAndSettle();
    }

    testWidgets('chips: All, Allowed, Blocked and one per company', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: mixed());
      await openActivity(tester);
      for (final label in ['All', 'Allowed', 'Blocked', 'QuickLoan', 'MediCare+']) {
        expect(find.descendant(of: find.byType(ChoiceChip), matching: find.text(label)), findsOneWidget);
      }
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
      expect(find.text('Records · MediCare+'), findsNWidgets(2));
    });

    testWidgets('Blocked shows only blocked rows, All brings everything back', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: mixed());
      await openActivity(tester);

      await tapChip(tester, 'Blocked');
      expect(find.text('Credit check · QuickLoan'), findsNothing);
      expect(find.text('Loan offers · QuickLoan'), findsOneWidget);
      expect(find.text('Records · MediCare+'), findsOneWidget);

      await tapChip(tester, 'All');
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
      expect(find.text('Records · MediCare+'), findsNWidgets(2));
    });

    testWidgets('a company filters to that company, and tapping it again clears it', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: mixed());
      await openActivity(tester);

      await tapChip(tester, 'MediCare+');
      expect(find.text('Credit check · QuickLoan'), findsNothing);
      expect(find.text('Records · MediCare+'), findsNWidgets(2));

      await tapChip(tester, 'MediCare+');
      expect(find.text('Credit check · QuickLoan'), findsOneWidget);
    });

    testWidgets('a decision and a company combine', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, core: mixed());
      await openActivity(tester);

      await tapChip(tester, 'Blocked');
      await tapChip(tester, 'MediCare+');
      expect(find.text('Records · MediCare+'), findsOneWidget);
      expect(find.text('No consent given'), findsOneWidget);
      expect(find.text('Loan offers · QuickLoan'), findsNothing);
    });

    testWidgets('a filter nothing matches shows the empty message', (tester) async {
      useTallScreen(tester);
      final core = coreWithActivity([activityItem('only', Decision.allowed, _now - 10)]);
      await pumpApp(tester, core: core);
      await openActivity(tester);

      await tapChip(tester, 'Blocked');
      expect(find.text('No activity yet. Data access by companies will appear here.'), findsOneWidget);
    });

    testWidgets('a live row that does not match the filter stays hidden', (tester) async {
      useTallScreen(tester);
      final liveEvents = FakeLiveEvents();
      await pumpApp(tester, core: mixed(), live: liveEvents);
      await openActivity(tester);
      await tapChip(tester, 'Blocked');

      liveEvents.emitAccess(activityItem('live-ok', Decision.allowed, _now, code: 'marketing', arrivedAt: fixedNow()));
      await tester.pumpAndSettle();
      expect(find.text('Just now'), findsNothing);

      await tapChip(tester, 'All');
      expect(find.text('Just now'), findsOneWidget);
    });
  });
}

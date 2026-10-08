// W11 requests inbox and W12 your Sammati ID (W-14, N-01; ui.md): what the customer sees when a company asks for
// consent without a QR, and what Decline, Block and Register really sign.

import 'dart:convert';
import 'dart:typed_data';

import 'package:eth_sig_util/eth_sig_util.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/notice.dart';
import 'package:sammati/core/requests.dart';
import 'package:sammati/core/wallet_providers.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

const _now = 1760000000;

InboxRequest request({String id = 'req_aaaa0001', String company = 'QuickLoan', String? message = 'Your loan form is ready', int hours = 23, String fiduciary = fiduciaryAddress, List<String> purposes = const ['Credit check']}) =>
    InboxRequest(
      requestId: id,
      fiduciary: fiduciary,
      company: company,
      color: '#2F5BEA',
      purposes: [for (final p in purposes) InboxPurpose(code: p.toLowerCase().replaceAll(' ', '_'), title: LocalizedText(en: p, hi: 'क्रेडिट जाँच', kn: 'ಕ್ರೆಡಿಟ್ ಪರಿಶೀಲನೆ'))],
      message: message,
      createdAt: _now - 60,
      expiresAt: _now + hours * 3600,
    );

ConsentRequested live(InboxRequest r) => ConsentRequested(requestId: r.requestId, fiduciary: r.fiduciary, fiduciaryName: r.company);

String addressOf(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(MaterialApp))).read(walletAddressProvider).value!;

bool signedBy(String message, String signature, String address) =>
    EthSigUtil.recoverPersonalSignature(signature: signature, message: Uint8List.fromList(utf8.encode(message))).toLowerCase() == address.toLowerCase();

Future<void> openInbox(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.notifications_none));
  await tester.pumpAndSettle();
}

void main() {
  group('the bell on Home', () {
    testWidgets('shows how many requests are waiting, and opens the inbox', (tester) async {
      final core = FakeCoreApi()..inbox = [request(), request(id: 'req_aaaa0002', company: 'MediCare+')];
      await pumpApp(tester, core: core);
      expect(find.text('2'), findsOneWidget); // the badge
      expect(find.bySemanticsLabel('2 requests'), findsOneWidget);
      await openInbox(tester);
      expect(find.text('Requests'), findsOneWidget);
    });

    testWidgets('shows no number when nothing is waiting', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      expect(find.byType(Badge), findsOneWidget);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
    });

    testWidgets('a request that arrives live raises the badge within the same moment', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = FakeCoreApi();
      await pumpApp(tester, core: core, live: liveEvents);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);

      final r = request();
      core.inbox = [r];
      liveEvents.emitRequested(live(r));
      await tester.pumpAndSettle();
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);
      expect(find.text('1'), findsOneWidget);
    });
  });

  group('the inbox', () {
    testWidgets('is empty until a company asks', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await openInbox(tester);
      expect(find.text('No requests. When a company asks for your consent it will appear here.'), findsOneWidget);
    });

    testWidgets('shows who asks, for what, their message and when it runs out, with the three actions', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..inbox = [request(purposes: ['Credit check', 'Loan offers'])]);
      await openInbox(tester);

      expect(find.text('QuickLoan'), findsOneWidget);
      expect(find.text('QuickLoan is asking for 2 purposes'), findsOneWidget);
      expect(find.text('Credit check · Loan offers'), findsOneWidget);
      expect(find.text('Message from QuickLoan'), findsOneWidget);
      expect(find.text('Your loan form is ready'), findsOneWidget);
      expect(find.text('Expires in 23 hours'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Review'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Decline'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Block this company'), findsOneWidget);
    });

    testWidgets('says "1 purpose", has no message line when there is none, and "under an hour" near the end', (tester) async {
      final r = InboxRequest(
        requestId: 'req_aaaa0009', fiduciary: fiduciaryAddress, company: 'QuickLoan', color: '#2F5BEA',
        purposes: [InboxPurpose(code: 'credit_check', title: const LocalizedText(en: 'Credit check', hi: 'क्रेडिट जाँच', kn: 'ಕ್ರೆಡಿಟ್'))],
        message: null, createdAt: _now - 60, expiresAt: _now + 1800,
      );
      await pumpApp(tester, core: FakeCoreApi()..inbox = [r]);
      await openInbox(tester);
      expect(find.text('QuickLoan is asking for 1 purpose'), findsOneWidget);
      expect(find.textContaining('Message from'), findsNothing);
      expect(find.text('Expires in under an hour'), findsOneWidget);
    });

    testWidgets('a new request arrives at the top, washed in from marigold, and settles', (tester) async {
      final liveEvents = FakeLiveEvents();
      final first = request(id: 'req_aaaa0001', company: 'QuickLoan');
      final core = FakeCoreApi()..inbox = [first];
      await pumpApp(tester, core: core, live: liveEvents);
      await openInbox(tester);

      final second = request(id: 'req_aaaa0002', company: 'MediCare+', message: null);
      core.inbox = [second, first];
      liveEvents.emitRequested(live(second));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      final names = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data).toList();
      expect(names.indexOf('MediCare+'), lessThan(names.indexOf('QuickLoan')), reason: 'newest first');

      DecoratedBox washOf(String company) => tester.widget<DecoratedBox>(find
          .ancestor(of: find.text(company), matching: find.byType(DecoratedBox))
          .last);
      Color? colourOf(DecoratedBox box) => (box.decoration as BoxDecoration).color;
      expect(colourOf(washOf('MediCare+')), isNot(const Color(0xFFFFFFFF)), reason: 'mid-wash the new card is tinted');
      expect(colourOf(washOf('QuickLoan')), const Color(0xFFFFFFFF), reason: 'the card that was already there is not');
      await tester.pumpAndSettle();
      expect(colourOf(washOf('MediCare+')), const Color(0xFFFFFFFF));
    });

    testWidgets('with reduced motion the new card is simply there', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = FakeCoreApi();
      await pumpApp(tester, core: core, live: liveEvents);
      await openInbox(tester);
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      final r = request();
      core.inbox = [r];
      liveEvents.emitRequested(live(r));
      await tester.pump();
      await tester.pump();
      final box = tester.widget<DecoratedBox>(find.ancestor(of: find.text('QuickLoan'), matching: find.byType(DecoratedBox)).last);
      expect((box.decoration as BoxDecoration).color, const Color(0xFFFFFFFF));
    });

    testWidgets('keeps the last known list and says so when Core cannot be reached', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core, live: liveEvents);
      await openInbox(tester);
      expect(find.text('No connection. Showing last known requests.'), findsNothing);

      core.inboxError = const CoreException(CoreFailure.unreachable);
      liveEvents.connected(true); // a reconnect refetches, and the fetch fails
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known requests.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsOneWidget);

      core.inboxError = null;
      liveEvents.connected(true);
      await tester.pumpAndSettle();
      expect(find.text('No connection. Showing last known requests.'), findsNothing);
    });

    testWidgets('a request that is gone after a grant leaves the list', (tester) async {
      final liveEvents = FakeLiveEvents();
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core, live: liveEvents);
      await openInbox(tester);
      expect(find.text('QuickLoan'), findsOneWidget);
      core.inbox = [];
      liveEvents.emit(ConsentUpdated(principal: addressOf(tester), fiduciary: fiduciaryAddress, purposeId: creditCheckId, status: ConsentStatus.active, expiresAt: _now + 100, txHash: '0xaa'));
      await tester.pumpAndSettle();
      expect(find.text('QuickLoan'), findsNothing);
    });
  });

  group('Review', () {
    testWidgets('opens the ordinary consent notice for that request', (tester) async {
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core);
      await openInbox(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Review'));
      await tester.pumpAndSettle();
      expect(core.noticeFetches, 1);
      expect(find.text('Credit check'), findsWidgets);
      expect(find.textContaining('Asking for'), findsOneWidget);
    });
  });

  group('Decline', () {
    testWidgets('signs the request, removes the card and says so', (tester) async {
      final presence = FakePresence();
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core, presence: presence);
      await openInbox(tester);

      await tester.tap(find.widgetWithText(TextButton, 'Decline'));
      await tester.pumpAndSettle();

      expect(presence.prompts, ['Confirm to decline this request']);
      final d = core.declines.single;
      expect(d.requestId, 'req_aaaa0001');
      expect(signedBy(declineMessage(d.requestId, d.principal, d.issuedAt), d.signature, addressOf(tester)), isTrue);
      expect(d.issuedAt, _now);
      expect(find.text('Request declined.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsNothing);
    });

    testWidgets('does nothing if the customer does not confirm', (tester) async {
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core, presence: FakePresence(approve: false));
      await openInbox(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Decline'));
      await tester.pumpAndSettle();
      expect(core.declines, isEmpty);
      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsOneWidget);
    });

    testWidgets('says when Core cannot be reached, and keeps the card', (tester) async {
      final core = FakeCoreApi()..inbox = [request()]..actionError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, core: core);
      await openInbox(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Decline'));
      await tester.pumpAndSettle();
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsOneWidget);
    });
  });

  group('Block this company', () {
    testWidgets('asks first, and Keep changes nothing', (tester) async {
      final core = FakeCoreApi()..inbox = [request()];
      await pumpApp(tester, core: core);
      await openInbox(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Block this company'));
      await tester.pumpAndSettle();
      expect(find.text('Block QuickLoan? They will not be able to send you requests.'), findsOneWidget);
      await tester.tap(find.text('Keep'));
      await tester.pumpAndSettle();
      expect(core.blockCalls, isEmpty);
      expect(find.text('QuickLoan'), findsOneWidget);
    });

    testWidgets('signs the block, removes the company\'s cards and says it is blocked', (tester) async {
      final presence = FakePresence();
      final core = FakeCoreApi()..inbox = [request(), request(id: 'req_aaaa0003'), request(id: 'req_bbbb0001', company: 'MediCare+', fiduciary: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')];
      await pumpApp(tester, core: core, presence: presence);
      await openInbox(tester);
      await tester.tap(find.widgetWithText(TextButton, 'Block this company').first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Block this company'));
      await tester.pumpAndSettle();

      expect(presence.prompts, ['Confirm to block this company']);
      final b = core.blockCalls.single;
      expect(b.action, 'block');
      expect(signedBy(blockMessage('block', b.fiduciary, addressOf(tester), b.issuedAt), b.signature, addressOf(tester)), isTrue);
      expect(find.text('QuickLoan is blocked.'), findsOneWidget);
      expect(find.text('QuickLoan'), findsNothing);
      expect(find.text('MediCare+'), findsOneWidget, reason: 'another company is unaffected');
    });

    testWidgets('the blocked list shows who is blocked and can undo it', (tester) async {
      final core = FakeCoreApi()..blocks = [const BlockedCompany(fiduciary: fiduciaryAddress, name: 'QuickLoan', blockedAt: _now)];
      await pumpApp(tester, core: core);
      await openInbox(tester);
      await tester.tap(find.text('Blocked companies'));
      await tester.pumpAndSettle();
      expect(find.text('QuickLoan'), findsOneWidget);

      await tester.tap(find.text('Unblock'));
      await tester.pumpAndSettle();
      final u = core.blockCalls.single;
      expect(u.action, 'unblock');
      expect(signedBy(blockMessage('unblock', u.fiduciary, addressOf(tester), u.issuedAt), u.signature, addressOf(tester)), isTrue);
      expect(find.text('You have not blocked anyone.'), findsOneWidget);
    });

    testWidgets('an empty blocked list says so', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await openInbox(tester);
      await tester.tap(find.text('Blocked companies'));
      await tester.pumpAndSettle();
      expect(find.text('You have not blocked anyone.'), findsOneWidget);
    });
  });

  group('Your Sammati ID', () {
    Future<void> openId(WidgetTester tester) async {
      await tester.tap(find.text('Me'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Your Sammati ID'));
      await tester.pumpAndSettle();
    }

    testWidgets('Me says there is none yet', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await tester.tap(find.text('Me'));
      await tester.pumpAndSettle();
      expect(find.text('No Sammati ID yet'), findsOneWidget);
    });

    testWidgets('Me shows the ID once there is one', (tester) async {
      await pumpApp(tester, core: FakeCoreApi()..identity = 'asha@sammati');
      await tester.tap(find.text('Me'));
      await tester.pumpAndSettle();
      expect(find.text('asha@sammati'), findsOneWidget);
    });

    testWidgets('explains what it is for, and asks for nothing but a name', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await openId(tester);
      expect(find.text('Companies can send you consent requests here. They never see your wallet address until you say yes.'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('@sammati'), findsOneWidget);
      expect(find.textContaining(RegExp('phone|email', caseSensitive: false)), findsNothing);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Register')).onPressed, isNull);
    });

    testWidgets('the name is lower case as typed, and a bad one says what is allowed', (tester) async {
      await pumpApp(tester, core: FakeCoreApi());
      await openId(tester);
      await tester.enterText(find.byType(TextField), 'ASHA');
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'asha');
      await tester.enterText(find.byType(TextField), 'as');
      await tester.pump();
      expect(find.text('Use 3 to 30 letters, numbers, dots or dashes'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Register')).onPressed, isNull);
      await tester.enterText(find.byType(TextField), 'a b!');
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'ab'); // spaces and symbols are not typed in
    });

    testWidgets('registering signs "sammati-id:v1:..." with the wallet key, behind one prompt, and shows the ID', (tester) async {
      final presence = FakePresence();
      final core = FakeCoreApi();
      await pumpApp(tester, core: core, presence: presence);
      await openId(tester);
      await tester.enterText(find.byType(TextField), 'asha.k');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();

      expect(presence.prompts, ['Confirm to register your Sammati ID']);
      final r = core.registrations.single;
      expect(r.handle, 'asha.k@sammati');
      expect(r.issuedAt, _now);
      expect(signedBy(identityMessage(r.handle, r.principal, r.issuedAt), r.signature, addressOf(tester)), isTrue);
      expect(r.principal, addressOf(tester));
      expect(find.text('asha.k@sammati'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    });

    testWidgets('a taken ID, no connection and a declined prompt each say so', (tester) async {
      final core = FakeCoreApi()..registerError = const CoreException(CoreFailure.rejected, code: 'HANDLE_TAKEN');
      final presence = FakePresence();
      await pumpApp(tester, core: core, presence: presence);
      await openId(tester);
      await tester.enterText(find.byType(TextField), 'asha');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('That ID is taken. Try another.'), findsOneWidget);

      core.registerError = const CoreException(CoreFailure.unreachable);
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);

      core.registerError = null;
      presence.approve = false;
      await tester.tap(find.widgetWithText(FilledButton, 'Register'));
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
      expect(core.registrations, isEmpty);
    });
  });

  testWidgets('the inbox reads in Hindi', (tester) async {
    await pumpApp(tester, core: FakeCoreApi()..inbox = [request()], stored: {'locale': 'hi'});
    await tester.tap(find.byIcon(Icons.notifications_none));
    await tester.pumpAndSettle();
    expect(find.text('अनुरोध'), findsOneWidget);
    expect(find.text('QuickLoan 1 उद्देश्यों के लिए सहमति माँग रही है'), findsOneWidget);
    expect(find.text('देखें'), findsOneWidget);
    expect(find.text('अस्वीकार करें'), findsOneWidget);
  });

  testWidgets('the inbox reads in Kannada', (tester) async {
    await pumpApp(tester, core: FakeCoreApi()..inbox = [request()], stored: {'locale': 'kn'});
    await tester.tap(find.byIcon(Icons.notifications_none));
    await tester.pumpAndSettle();
    expect(find.text('ವಿನಂತಿಗಳು'), findsOneWidget);
    expect(find.text('ಪರಿಶೀಲಿಸಿ'), findsOneWidget);
  });
}

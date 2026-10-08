// V2 send securely (ui.md): what the user sees, in each state and language.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/consents.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/processor_api.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/finders.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;
const _loan = {'pan': 'QZXWV9876K', 'incomeBand': '6-9 LPA', 'employment': 'salaried'};
const _principal = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

FakeCoreApi seeded() => FakeCoreApi()
  ..seed(creditCheckId, expiresAt: _now + 150 * _day)
  ..seed(marketingId, expiresAt: _now + 90 * _day);

VaultNotice notice(VaultNoticeKind kind, String handle, {String purposeCode = 'credit_check'}) => VaultNotice(
      kind: kind,
      principal: _principal,
      fiduciary: fiduciaryAddress,
      purposeCode: purposeCode,
      handle: handle,
    );

Future<void> openPass(WidgetTester tester) async {
  await tester.tap(find.text('QuickLoan'));
  await tester.pumpAndSettle();
}

Finder sendButton() => textButtonWithText('Send securely');

/// The pass's button opens W10; there the customer sends the profile's details. Comes back to the pass when it worked.
Future<void> shareDemo(WidgetTester tester) async {
  await tester.tap(sendButton());
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(FilledButton, 'Send securely'));
  await tester.pumpAndSettle();
  if (find.text('Done').evaluate().isNotEmpty) {
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
  }
}

void main() {
  group('V2 send securely', () {
    testWidgets('is offered on the credit check, with the hint, and not on a purpose that carries no data', (tester) async {
      await pumpApp(tester, profile: _loan, core: seeded());
      await openPass(tester);

      expect(sendButton(), findsOneWidget);
      expect(find.text('QuickLoan gets a decision, not your details. Only the Sammati Processor can open them.'), findsOneWidget);
    });

    testWidgets('encrypts, sends, and then says what QuickLoan holds: a reference', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, profile: _loan, core: seeded(), processor: processor);
      await openPass(tester);

      await shareDemo(tester);

      expect(processor.submissions, hasLength(1));
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
      expect(textButtonWithText('Send again'), findsOneWidget);
      expect(sendButton(), findsNothing);
      // the handle is shown shortened, like every hash
      expect(find.textContaining('…'), findsWidgets);
      expect(find.text('ABCDE1234F'), findsNothing);
    });

    testWidgets('the Processor erasing it shows on the phone', (tester) async {
      final live = FakeLiveEvents();
      final processor = FakeProcessorApi();
      await pumpApp(tester, profile: _loan, core: seeded(), live: live, processor: processor);
      await openPass(tester);
      await shareDemo(tester);
      final handle = _handleOf(processor);

      live.emitVault(notice(VaultNoticeKind.erased, handle));
      await tester.pumpAndSettle();
      expect(find.text('Your encrypted details were erased.'), findsOneWidget);
      expect(textButtonWithText('Send again'), findsNothing);
    });

    testWidgets('an erase of an older copy changes nothing', (tester) async {
      final live = FakeLiveEvents();
      await pumpApp(tester, profile: _loan, core: seeded(), live: live);
      await openPass(tester);
      await shareDemo(tester);

      live.emitVault(notice(VaultNoticeKind.erased, '0x${'11' * 32}'));
      await tester.pumpAndSettle();
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
    });

    testWidgets('a copy stored from another device shows as sent', (tester) async {
      final live = FakeLiveEvents();
      await pumpApp(tester, profile: _loan, core: seeded(), live: live);
      await openPass(tester);
      live.emitVault(notice(VaultNoticeKind.stored, '0x${'22' * 32}'));
      await tester.pumpAndSettle();
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
    });

    testWidgets('withdrawing the purpose takes the button away and says the details were erased', (tester) async {
      final live = FakeLiveEvents();
      final core = seeded();
      await pumpApp(tester, profile: _loan, core: core, live: live);
      await openPass(tester);
      await shareDemo(tester);

      live.emit(ConsentUpdated(
        principal: _principal,
        fiduciary: fiduciaryAddress,
        purposeId: creditCheckId,
        status: ConsentStatus.withdrawn,
        expiresAt: null,
        txHash: '0xdd',
      ));
      await tester.pumpAndSettle();
      expect(find.text('Your encrypted details were erased.'), findsOneWidget);
      expect(sendButton(), findsNothing);
      expect(textButtonWithText('Send again'), findsNothing);
    });

    testWidgets('no button, and nothing said, for a purpose that was never sent and is withdrawn', (tester) async {
      final core = FakeCoreApi()..seed(creditCheckId, status: 'Withdrawn', expiresAt: _now + 150 * _day);
      await pumpApp(tester, profile: _loan, core: core);
      await openPass(tester);
      expect(sendButton(), findsNothing);
      expect(find.text('Your encrypted details were erased.'), findsNothing);
    });

    testWidgets('says what went wrong, and offers to try again', (tester) async {
      final processor = FakeProcessorApi()..submitError = const CoreException(CoreFailure.server);
      await pumpApp(tester, profile: _loan, core: seeded(), processor: processor);
      await openPass(tester);
      await shareDemo(tester);
      expect(find.text('Could not send securely. Try again.'), findsOneWidget);

      // the screen keeps what was typed, so trying again is one tap
      processor.submitError = null;
      await tester.tap(find.widgetWithText(FilledButton, 'Send securely'));
      await tester.pumpAndSettle();
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
    });

    testWidgets('an unreachable Processor is "could not reach Sammati"', (tester) async {
      final core = seeded()..processorUrlError = const CoreException(CoreFailure.unreachable);
      await pumpApp(tester, profile: _loan, core: core);
      await openPass(tester);
      await shareDemo(tester);
      expect(find.text('Could not reach Sammati. Check Wi-Fi.'), findsOneWidget);
    });

    testWidgets('the Processor refusing (consent not valid) is a failure, not a success', (tester) async {
      final processor = FakeProcessorApi()..submitError = const VaultRefusedException('CONSENT_WITHDRAWN');
      await pumpApp(tester, profile: _loan, core: seeded(), processor: processor);
      await openPass(tester);
      await shareDemo(tester);
      expect(find.text('Could not send securely. Try again.'), findsOneWidget);
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsNothing);
    });

    testWidgets('declining the device prompt sends nothing', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, profile: _loan, core: seeded(), processor: processor, presence: FakePresence(approve: false));
      await openPass(tester);
      await tester.tap(sendButton());
      await tester.pumpAndSettle();
      // the profile stays locked, so nothing is shown and nothing is encrypted or sent
      expect(processor.submissions, isEmpty);
      expect(find.text('Your details are locked'), findsOneWidget);
    });

    testWidgets('reads in Hindi', (tester) async {
      await pumpApp(tester, profile: _loan, core: seeded(), stored: {'locale': 'hi'});
      await tester.tap(find.text('QuickLoan'));
      await tester.pumpAndSettle();
      expect(textButtonWithText('सुरक्षित रूप से भेजें'), findsOneWidget);
    });
  });
}

/// The handle of the last envelope the fake Processor was given.
String _handleOf(FakeProcessorApi processor) =>
    Envelope.fromJson((processor.submissions.last['envelope'] as Map).cast<String, dynamic>()).handle;

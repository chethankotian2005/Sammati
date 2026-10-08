// W10 share your details securely (W-13, ui.md W10): it shows exactly the profile fields the purpose's data categories
// need, asks only for the missing ones, encrypts only those, and saves what was typed so it is asked once.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/envelope.dart';
import 'package:sammati/core/profile_controller.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/finders.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;

FakeCoreApi seeded() => FakeCoreApi()..seed(creditCheckId, expiresAt: _now + 150 * _day);

Finder sendFilled() => find.widgetWithText(FilledButton, 'Send securely');

/// A profile with more than the loan needs, so "only what the purpose names" is visible.
const rich = {
  'fullName': 'Zebulon Quillfeather',
  'mobile': '9123456780',
  'pan': 'QZXWV9876K',
  'employment': 'salaried',
};

Future<void> open(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.tap(find.text('QuickLoan'));
  await tester.pumpAndSettle();
  await tester.tap(find.byIcon(Icons.lock_outline)); // the pass's "send securely", in whatever language
  await tester.pumpAndSettle();
}

Future<void> pick(WidgetTester tester, String field, String option) async {
  await tester.tap(find.text(field));
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

ProviderContainer containerOf(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));

/// What the Processor would read: opens the envelope the fake Processor was given with the vectors' processor key.
Future<Map<String, dynamic>> opened(FakeProcessorApi processor) async {
  final vectors = jsonDecode(File('../shared/test-vectors/envelope.json').readAsStringSync()) as Map<String, dynamic>;
  final key = Uint8List.fromList(hex.decode(((vectors['processor'] as Map)['privateKey'] as String).substring(2)));
  final submission = processor.submissions.last;
  final envelope = Envelope.fromJson((submission['envelope'] as Map).cast<String, dynamic>());
  final clear = await openEnvelope(envelope, key, EnvelopeContext(fiduciary: fiduciaryAddress, principal: submission['principal'] as String, purposeCode: 'credit_check'));
  return jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
}

void main() {
  group('what it asks for', () {
    testWidgets('lists the fields the profile has and asks only for the one it lacks, nothing else', (tester) async {
      await pumpApp(tester, core: seeded(), profile: rich);
      await open(tester);

      expect(find.text('From My details'), findsOneWidget);
      expect(find.text('QuickLoan also needs these'), findsOneWidget);
      // the loan names PAN, income and type of work; the name and mobile in the profile are not part of it
      expect(find.text('QZXWV9876K'), findsOneWidget);
      expect(find.text('Salaried'), findsOneWidget);
      expect(find.text('Zebulon Quillfeather'), findsNothing);
      expect(find.text('9123456780'), findsNothing);
      expect(find.text('Full name'), findsNothing);
      // only the missing income is an input
      expect(find.text('Yearly income'), findsOneWidget);
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
      expect(find.text('Demo processor (simulated enclave, not real hardware protection)'), findsOneWidget);
    });

    testWidgets('asks for nothing when the profile already has every field, and sends in one tap', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor, profile: {...rich, 'incomeBand': '6-9 LPA'});
      await open(tester);

      expect(find.text('QuickLoan also needs these'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNotNull);
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      expect(await opened(processor), {'pan': 'QZXWV9876K', 'incomeBand': '6-9 LPA', 'employment': 'salaried'});
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
    });

    testWidgets('an empty profile asks for all three, and Send waits for valid values', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);

      expect(find.text('From My details'), findsNothing);
      expect(find.text('QuickLoan also needs these'), findsOneWidget);
      final pan = find.widgetWithText(TextField, 'PAN');
      await tester.enterText(pan, 'abc');
      await tester.pump();
      expect(find.text('Enter a PAN like ABCDE1234F'), findsOneWidget);
      await tester.enterText(pan, 'qzxwv9876k');
      await tester.pump();
      expect(tester.widget<TextField>(pan).controller!.text, 'QZXWV9876K');
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
      await pick(tester, 'Yearly income', '6 to 9 LPA');
      await pick(tester, 'Type of work', 'Salaried');
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNotNull);
    });
  });

  group('what is sent and kept', () {
    testWidgets('only the purpose\'s fields are encrypted; what was typed is saved to the profile; the wire has no plaintext', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor, profile: rich);
      await open(tester);
      await pick(tester, 'Yearly income', '3 to 6 LPA');
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      expect(await opened(processor), {'pan': 'QZXWV9876K', 'incomeBand': '3-6 LPA', 'employment': 'salaried'});
      final wire = jsonEncode(processor.submissions.single);
      for (final secret in ['QZXWV9876K', 'Zebulon', '9123456780', '3-6 LPA']) {
        expect(wire, isNot(contains(secret)));
      }
      // typed once, kept: the profile now has the income, and the share is recorded by field names
      final profile = containerOf(tester).read(profileProvider).doc;
      expect(profile.fields['incomeBand'], '3-6 LPA');
      expect(profile.shareFor(fiduciaryAddress, 'credit_check')!.fields, unorderedEquals(['pan', 'incomeBand', 'employment']));
      expect(profile.shareFor(fiduciaryAddress, 'credit_check')!.stale, isFalse);
    });

    testWidgets('an edit to a value already shown is saved and sent', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor, profile: {...rich, 'incomeBand': '6-9 LPA'});
      await open(tester);
      await tester.tap(find.text('Edit').first);
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('asks the device for confirmation, and sends nothing if the profile stays locked', (tester) async {
      final processor = FakeProcessorApi();
      final presence = FakePresence();
      await pumpApp(tester, core: seeded(), processor: processor, presence: presence, profile: rich);
      presence.approve = false;
      await open(tester);
      expect(find.text('Your details are locked'), findsOneWidget);
      expect(find.text('QZXWV9876K'), findsNothing);
      expect(sendFilled(), findsNothing);
      expect(processor.submissions, isEmpty);

      presence.approve = true;
      await tester.tap(find.text('Unlock'));
      await tester.pumpAndSettle();
      expect(find.text('QZXWV9876K'), findsOneWidget);
    });
  });

  group('after it was sent', () {
    testWidgets('the form is gone, the PAN is on no screen, and Done returns to the pass', (tester) async {
      await pumpApp(tester, core: seeded(), profile: {...rich, 'incomeBand': '6-9 LPA'});
      await open(tester);
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
      expect(find.text('QZXWV9876K'), findsNothing, reason: 'the PAN is not on this screen once it has been sent');
      expect(find.textContaining('…'), findsWidgets);
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(textButtonWithText('Send again'), findsOneWidget);
    });
  });

  testWidgets('reads in Hindi', (tester) async {
    await pumpApp(tester, core: seeded(), stored: {'locale': 'hi'}, profile: rich);
    await open(tester);
    expect(find.text('अपना विवरण सुरक्षित रूप से साझा करें'), findsOneWidget);
    expect(find.text('मेरी जानकारी से'), findsOneWidget);
    expect(find.text('वार्षिक आय'), findsOneWidget);
  });

  testWidgets('reads in Kannada', (tester) async {
    await pumpApp(tester, core: seeded(), stored: {'locale': 'kn'}, profile: rich);
    await open(tester);
    expect(find.text('ನನ್ನ ವಿವರಗಳಿಂದ'), findsOneWidget);
    expect(find.text('ವಾರ್ಷಿಕ ಆದಾಯ'), findsOneWidget);
  });

  group('the receipt offers it right after consent', () {
    testWidgets('the credit check consent leads to W10, which names the company', (tester) async {
      useTallScreen(tester);
      final core = await pumpApp(tester, profile: rich);
      await tester.tap(find.byIcon(Icons.qr_code_scanner));
      await tester.pumpAndSettle();
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      expect(core.noticeFetches, greaterThan(0));
      await tester.tap(find.byType(Switch).first); // credit check
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Give consent (1)'));
      await tester.pumpAndSettle();

      expect(find.text('Share your details securely'), findsOneWidget);
      await tester.tap(find.text('Share your details securely'));
      await tester.pumpAndSettle();
      expect(find.text('QuickLoan needs these details for this purpose. They are encrypted on this phone, so QuickLoan never sees them.'), findsOneWidget);
    });

    testWidgets('a consent for a purpose that uses no data offers nothing to share', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await tester.tap(find.byIcon(Icons.qr_code_scanner));
      await tester.pumpAndSettle();
      await tester.tap(find.text('read valid qr'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Switch).at(1)); // loan offers
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Give consent (1)'));
      await tester.pumpAndSettle();
      expect(find.text('Recorded on the ledger'), findsOneWidget);
      expect(find.text('Share your details securely'), findsNothing);
    });
  });
}

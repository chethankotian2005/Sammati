// W10 share your details securely (W-13, ui.md W10): what the customer can type, what is checked on the phone, what
// is encrypted and sent, and that nothing is kept.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:convert/convert.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/demo_profile.dart';
import 'package:sammati/core/envelope.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;

FakeCoreApi seeded() => FakeCoreApi()..seed(creditCheckId, expiresAt: _now + 150 * _day);

Finder sendFilled() => find.widgetWithText(FilledButton, 'Send securely');
Finder panField() => find.byType(TextField);

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

/// What the Processor would read: opens the envelope the fake Processor was given with the vectors' processor key.
Future<Map<String, dynamic>> opened(FakeProcessorApi processor, String principal) async {
  final vectors = jsonDecode(File('../shared/test-vectors/envelope.json').readAsStringSync()) as Map<String, dynamic>;
  final key = Uint8List.fromList(hex.decode(((vectors['processor'] as Map)['privateKey'] as String).substring(2)));
  final submission = processor.submissions.last;
  final envelope = Envelope.fromJson((submission['envelope'] as Map).cast<String, dynamic>());
  final clear = await openEnvelope(envelope, key, EnvelopeContext(fiduciary: fiduciaryAddress, principal: principal, purposeCode: 'credit_check'));
  return jsonDecode(utf8.decode(clear)) as Map<String, dynamic>;
}

void main() {
  group('the form', () {
    testWidgets('starts empty, explains who never sees the details, and cannot be sent', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);

      expect(find.text('Share your details securely'), findsOneWidget); // the title
      expect(find.text('QuickLoan needs these to decide your loan. They are encrypted on this phone, so QuickLoan never sees them.'), findsOneWidget);
      expect((tester.widget<TextField>(panField()).controller!.text), isEmpty);
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
      expect(find.text('Demo processor (simulated enclave, not real hardware protection)'), findsOneWidget);
      expect(find.text('Use demo details'), findsOneWidget);
    });

    testWidgets('PAN is capitals as typed, and an invalid one says what is expected', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);

      await tester.enterText(panField(), 'abc');
      await tester.pump();
      expect(tester.widget<TextField>(panField()).controller!.text, 'ABC');
      expect(find.text('Enter a PAN like ABCDE1234F'), findsOneWidget);

      await tester.enterText(panField(), 'abcde1234f');
      await tester.pump();
      expect(tester.widget<TextField>(panField()).controller!.text, 'ABCDE1234F');
      expect(find.text('Enter a PAN like ABCDE1234F'), findsNothing);

      await tester.enterText(panField(), 'ABCDE1234FXYZ'); // longer than a PAN: the field stops at ten
      await tester.pump();
      expect(tester.widget<TextField>(panField()).controller!.text.length, lessThanOrEqualTo(10));
    });

    testWidgets('Send stays off until the PAN is valid and both choices are made', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);
      await tester.enterText(panField(), 'ABCDE1234F');
      await tester.pump();
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
      await pick(tester, 'Income band', '6 to 9 LPA');
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
      await pick(tester, 'Employment', 'Salaried');
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNotNull);
      await tester.enterText(panField(), 'ABCDE1234'); // broken again
      await tester.pump();
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
    });

    testWidgets('"Use demo details" fills all three', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(panField()).controller!.text, 'ABCDE1234F');
      expect(find.text('6 to 9 LPA'), findsOneWidget);
      expect(find.text('Salaried'), findsOneWidget);
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNotNull);
    });
  });

  group('what is sent', () {
    testWidgets('the demo details go with the demo credit score', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor);
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      expect(processor.submissions, hasLength(1));
      final principal = processor.submissions.single['principal'] as String;
      expect(await opened(processor, principal), {'pan': 'ABCDE1234F', 'incomeBand': '6-9 LPA', 'employment': 'salaried', 'score': 742});
      // and only ciphertext crossed: nothing in what the Processor was handed is readable
      expect(jsonEncode(processor.submissions.single), isNot(contains('ABCDE1234F')));
    });

    testWidgets('details typed by hand go without a score: the customer has none to give', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor);
      await open(tester);
      await tester.enterText(panField(), 'pqrst5678u');
      await tester.pump();
      await pick(tester, 'Income band', '3 to 6 LPA');
      await pick(tester, 'Employment', 'Self-employed');
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      final principal = processor.submissions.single['principal'] as String;
      expect(await opened(processor, principal), {'pan': 'PQRST5678U', 'incomeBand': '3-6 LPA', 'employment': 'self-employed'});
    });

    testWidgets('editing the demo details takes the demo score away', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor);
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      await pick(tester, 'Salaried', 'Student');
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      final principal = processor.submissions.single['principal'] as String;
      expect(await opened(processor, principal), {'pan': 'ABCDE1234F', 'incomeBand': '6-9 LPA', 'employment': 'student'});
    });

    testWidgets('asks the device for confirmation, and sends nothing if declined', (tester) async {
      final processor = FakeProcessorApi();
      await pumpApp(tester, core: seeded(), processor: processor, presence: FakePresence(approve: false));
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();
      expect(processor.submissions, isEmpty);
      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
      // what was typed is kept for another try
      expect(tester.widget<TextField>(panField()).controller!.text, 'ABCDE1234F');
    });
  });

  group('after it was sent', () {
    testWidgets('the form is gone, the handle is shown shortened, and Done returns to the pass', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();

      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('ABCDE1234F'), findsNothing, reason: 'the PAN is not on any screen once it has been sent');
      expect(find.textContaining('…'), findsWidgets);

      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextButton, 'Send again'), findsOneWidget);
    });

    testWidgets('opening the screen again starts empty', (tester) async {
      await pumpApp(tester, core: seeded());
      await open(tester);
      await tester.tap(find.text('Use demo details'));
      await tester.pumpAndSettle();
      await tester.tap(sendFilled());
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Send again'));
      await tester.pumpAndSettle();
      // a fresh form, with nothing in it and no leftover "sent" line
      expect(tester.widget<TextField>(panField()).controller!.text, isEmpty);
      expect(find.text('Sent encrypted. QuickLoan holds only a reference.'), findsNothing);
      expect(tester.widget<FilledButton>(sendFilled()).onPressed, isNull);
    });
  });

  testWidgets('reads in Hindi', (tester) async {
    await pumpApp(tester, core: seeded(), stored: {'locale': 'hi'});
    await open(tester);
    expect(find.text('अपना विवरण सुरक्षित रूप से साझा करें'), findsOneWidget);
    expect(find.text('डेमो विवरण भरें'), findsOneWidget);
    expect(find.text('आय वर्ग'), findsOneWidget);
    expect(find.text('रोज़गार'), findsOneWidget);
  });

  testWidgets('reads in Kannada', (tester) async {
    await pumpApp(tester, core: seeded(), stored: {'locale': 'kn'});
    await open(tester);
    expect(find.text('ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಹಂಚಿಕೊಳ್ಳಿ'), findsOneWidget);
    expect(find.text('ಆದಾಯ ವರ್ಗ'), findsOneWidget);
  });

  group('the receipt offers it right after consent', () {
    testWidgets('the credit check consent leads straight to W10, with the company named', (tester) async {
      useTallScreen(tester);
      final core = await pumpApp(tester);
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
      expect(find.text('QuickLoan needs these to decide your loan. They are encrypted on this phone, so QuickLoan never sees them.'), findsOneWidget);
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

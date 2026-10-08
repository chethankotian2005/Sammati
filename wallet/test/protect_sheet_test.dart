import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/pump_app.dart';

Future<void> openNotice(WidgetTester tester) async {
  await tester.tap(find.byIcon(Icons.qr_code_scanner));
  await tester.pumpAndSettle();
  await tester.tap(find.text('read valid qr'));
  await tester.pumpAndSettle();
}

void main() {
  group('"How this protects you" on the consent notice (L-02)', () {
    testWidgets('is offered under the withdraw line and opens a sheet of plain points and an honest note', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await openNotice(tester);

      expect(find.text('How this protects you'), findsOneWidget);
      await tester.tap(find.text('How this protects you'));
      await tester.pumpAndSettle();

      expect(find.text('Each purpose is your own choice. Nothing is ticked for you.'), findsOneWidget);
      expect(find.textContaining('withdraw any purpose later in two taps'), findsOneWidget);
      expect(find.textContaining('If the record is edited later, the edit shows.'), findsOneWidget);
      expect(find.textContaining('the secure processor is simulated'), findsOneWidget, reason: 'the simulation is said, not hidden');
      expect(find.textContaining('aligned with the principles of'), findsOneWidget);
      expect(find.textContaining('not legal advice and not a certification'), findsOneWidget);
      expect(find.textContaining('docs/dpdp-mapping.md'), findsOneWidget);
    });

    testWidgets('adds nothing to giving consent: still nothing ticked, button still disabled', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester);
      await openNotice(tester);
      await tester.tap(find.text('How this protects you'));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(10, 10)); // dismiss
      await tester.pumpAndSettle();

      for (final s in tester.widgetList<Switch>(find.byType(Switch))) {
        expect(s.value, isFalse);
      }
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Give consent')).onPressed, isNull);
    });

    testWidgets('reads in Hindi', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, stored: {'locale': 'hi'});
      await openNotice(tester);
      await tester.tap(find.text('यह आपको कैसे सुरक्षित रखता है'));
      await tester.pumpAndSettle();
      expect(find.textContaining('आपके लिए कुछ भी पहले से चुना नहीं गया है'), findsOneWidget);
      expect(find.textContaining('docs/dpdp-mapping.md'), findsOneWidget);
    });

    testWidgets('reads in Kannada', (tester) async {
      useTallScreen(tester);
      await pumpApp(tester, stored: {'locale': 'kn'});
      await openNotice(tester);
      await tester.tap(find.text('ಇದು ನಿಮ್ಮನ್ನು ಹೇಗೆ ರಕ್ಷಿಸುತ್ತದೆ'));
      await tester.pumpAndSettle();
      expect(find.textContaining('ನಿಮಗಾಗಿ ಯಾವುದನ್ನೂ ಮೊದಲೇ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ'), findsOneWidget);
      expect(find.textContaining('docs/dpdp-mapping.md'), findsOneWidget);
    });

    testWidgets('a long Hindi sheet on a small phone scrolls instead of overflowing', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await pumpApp(tester, stored: {'locale': 'hi'});
      await openNotice(tester);
      await tester.tap(find.text('यह आपको कैसे सुरक्षित रखता है'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('no overclaiming in the wallet\'s strings (L-02)', () {
    // Wording rules from docs/dpdp-mapping.md §6: say "aligned with the principles of", never claim a
    // finding, and print no section or rule number that has not been checked.
    final banned = <String, RegExp>{
      'compliant': RegExp(r'\bcompliant\b', caseSensitive: false),
      'certified': RegExp(r'\bcertified\b', caseSensitive: false),
      'approved by': RegExp(r'\bapproved by\b', caseSensitive: false),
      'legally valid / binding': RegExp(r'\blegally\s+(valid|binding|compliant)\b', caseSensitive: false),
      'a section sign': RegExp('§'),
      'section N': RegExp(r'\bsection\s*\d', caseSensitive: false),
      'rule N': RegExp(r'\brule\s*\d', caseSensitive: false),
    };

    for (final locale in ['en', 'hi', 'kn']) {
      test('app_$locale.arb makes none of the banned claims', () {
        final arb = jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync()) as Map<String, dynamic>;
        for (final entry in arb.entries) {
          final value = entry.value;
          if (entry.key.startsWith('@') || value is! String) continue;
          banned.forEach((label, pattern) {
            expect(pattern.hasMatch(value), isFalse, reason: '"${entry.key}" contains $label: $value');
          });
        }
      });
    }

    test('the English note says "aligned with the principles of", not compliant', () {
      final arb = jsonDecode(File('lib/l10n/app_en.arb').readAsStringSync()) as Map<String, dynamic>;
      final note = arb['protect_note'] as String;
      expect(note, contains('aligned with the principles of'));
      expect(note, contains('not legal advice'));
    });
  });
}

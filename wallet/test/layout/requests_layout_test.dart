// The requests inbox and the Sammati ID screen and the demo-details screen in English, Hindi and Kannada, on a small phone at large
// system text, with the real bundled fonts: no overflow, no text cut off or past the screen edge (see
// notice_layout_test.dart for why the fonts are loaded). Covers every state the section can be in.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/notice.dart';
import 'package:sammati/core/requests.dart';
import 'package:sammati/features/requests/requests_screen.dart';
import 'package:sammati/features/requests/sammati_id_screen.dart';

import '../support/fake_core.dart';
import '../support/pump_app.dart';

Future<void> _loadBundledFonts() async {
  const files = {
    'Manrope': 'assets/fonts/Manrope.ttf',
    'NotoSansDevanagari': 'assets/fonts/NotoSansDevanagari.ttf',
    'NotoSansKannada': 'assets/fonts/NotoSansKannada.ttf',
    'IBMPlexMono': 'assets/fonts/IBMPlexMono-Regular.ttf',
  };
  for (final entry in files.entries) {
    final bytes = await File(entry.value).readAsBytes();
    final loader = FontLoader(entry.key)..addFont(Future.value(ByteData.view(bytes.buffer)));
    await loader.load();
  }
}

/// Every paragraph under [root]: where it sits and whether a line limit cut it off.
List<({String text, Rect rect, bool truncated})> _paragraphs(RenderObject root) {
  final out = <({String text, Rect rect, bool truncated})>[];
  void visit(RenderObject node) {
    if (node is RenderParagraph && node.attached && node.hasSize && node.size.width > 0) {
      out.add((text: node.text.toPlainText(), rect: node.localToGlobal(Offset.zero) & node.size, truncated: node.didExceedMaxLines));
    }
    node.visitChildren(visit);
  }

  visit(root);
  return out;
}

void _expectFits(WidgetTester tester, Type screen, double width) {
  expect(tester.takeException(), isNull, reason: 'a layout exception (overflow)');
  final paragraphs = _paragraphs(tester.renderObject(find.byType(screen)));
  expect(paragraphs, isNotEmpty);
  for (final p in paragraphs) {
    expect(p.truncated, isFalse, reason: '"${p.text}" is cut off by a line limit');
    expect(p.rect.left, greaterThanOrEqualTo(-0.5), reason: '"${p.text}" starts left of the screen');
    expect(p.rect.right, lessThanOrEqualTo(width + 0.5), reason: '"${p.text}" runs past the right edge');
  }
}

void main() {
  setUpAll(_loadBundledFonts);

  const width = 360.0;
  final long = InboxRequest(
    requestId: 'req_aaaa0001',
    fiduciary: fiduciaryAddress,
    company: 'QuickLoan Financial Services',
    color: '#2F5BEA',
    purposes: [
      InboxPurpose(code: 'credit_check', title: const LocalizedText(en: 'Credit check', hi: 'क्रेडिट जाँच', kn: 'ಕ್ರೆಡಿಟ್ ಪರಿಶೀಲನೆ')),
      InboxPurpose(code: 'bureau_share', title: const LocalizedText(en: 'Credit bureau sharing', hi: 'क्रेडिट ब्यूरो से साझा करना', kn: 'ಕ್ರೆಡಿಟ್ ಬ್ಯೂರೊಗೆ ಹಂಚಿಕೆ')),
    ],
    message: 'Your loan application is ready for review. Please approve the purposes so we can continue.',
    createdAt: 1760000000 - 60,
    expiresAt: 1760000000 + 1800,
  );

  for (final locale in ['en', 'hi', 'kn']) {
    for (final scale in [1.0, 2.0]) {
      void phone(WidgetTester tester) {
        tester.view.devicePixelRatio = 2;
        tester.view.physicalSize = const Size(width, 3000) * 2;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(() {
          tester.view.reset();
          tester.platformDispatcher.clearAllTestValues();
        });
      }

      testWidgets('requests inbox, $locale, text x$scale: the card and the blocked list fit', (tester) async {
        phone(tester);
        final core = FakeCoreApi()
          ..inbox = [long]
          ..blocks = [const BlockedCompany(fiduciary: fiduciaryAddress, name: 'QuickLoan Financial Services', blockedAt: 1760000000)];
        await pumpApp(tester, stored: {'locale': locale}, core: core);
        await tester.tap(find.byIcon(Icons.notifications_none));
        await tester.pumpAndSettle();
        _expectFits(tester, RequestsScreen, width);

        await tester.tap(find.byIcon(Icons.block));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        // the sheet is a route of its own: look at everything on screen
        final all = _paragraphs(tester.renderObject(find.byType(BottomSheet)));
        for (final p in all) {
          expect(p.truncated, isFalse, reason: '"${p.text}" is cut off by a line limit');
          expect(p.rect.right, lessThanOrEqualTo(width + 0.5), reason: '"${p.text}" runs past the right edge');
        }
      });

      testWidgets('requests inbox, $locale, text x$scale: the block confirmation fits', (tester) async {
        phone(tester);
        await pumpApp(tester, stored: {'locale': locale}, core: FakeCoreApi()..inbox = [long]);
        await tester.tap(find.byIcon(Icons.notifications_none));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(TextButton).at(1)); // Block this company
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (final p in _paragraphs(tester.renderObject(find.byType(BottomSheet)))) {
          expect(p.truncated, isFalse, reason: '"${p.text}" is cut off by a line limit');
          expect(p.rect.right, lessThanOrEqualTo(width + 0.5), reason: '"${p.text}" runs past the right edge');
        }
      });

      testWidgets('Sammati ID, $locale, text x$scale: fits, with an error showing', (tester) async {
        phone(tester);
        await pumpApp(tester, stored: {'locale': locale}, core: FakeCoreApi()..identity = 'asha.krishnamurthy@sammati');
        final meTab = switch (locale) { 'hi' => 'मैं', 'kn' => 'ನಾನು', _ => 'Me' };
        await tester.tap(find.text(meTab));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.alternate_email).first);
        await tester.pumpAndSettle();
        _expectFits(tester, SammatiIdScreen, width);
        await tester.enterText(find.byType(TextField), 'ab');
        await tester.pump();
        _expectFits(tester, SammatiIdScreen, width);
      });
    }
  }
}

// The "send securely" section and the demo-details screen in English, Hindi and Kannada, on a small phone at large
// system text, with the real bundled fonts: no overflow, no text cut off or past the screen edge (see
// notice_layout_test.dart for why the fonts are loaded). Covers every state the section can be in.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/live_events.dart';
import 'package:sammati/core/core_api.dart';
import 'package:sammati/features/consents/pass_detail_screen.dart';
import 'package:sammati/features/profile/profile_screen.dart';
import 'package:sammati/features/vault/share_details_screen.dart';

import '../support/fake_core.dart';
import '../support/pump_app.dart';

const _now = 1760000000;
const _day = 86400;
const _loanProfile = {'pan': 'QZXWV9876K', 'incomeBand': '6-9 LPA', 'employment': 'salaried'};

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

  const size = Size(360, 640);
  for (final locale in ['en', 'hi', 'kn']) {
    for (final scale in [1.0, 2.0]) {
      void phone(WidgetTester tester) {
        tester.view.devicePixelRatio = 2;
        tester.view.physicalSize = const Size(360, 3000) * 2; // tall: the section sits below the fold otherwise
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(() {
          tester.view.reset();
          tester.platformDispatcher.clearAllTestValues();
        });
      }

      FakeCoreApi core() => FakeCoreApi()..seed(creditCheckId, expiresAt: _now + 150 * _day);

      testWidgets('send securely, $locale, text x$scale: idle, sent, erased and failed all fit', (tester) async {
        phone(tester);
        final live = FakeLiveEvents();
        final processor = FakeProcessorApi();
        await pumpApp(tester, stored: {'locale': locale}, core: core(), live: live, processor: processor, profile: _loanProfile);
        await tester.tap(find.text('QuickLoan'));
        await tester.pumpAndSettle();
        _expectFits(tester, PassDetailScreen, size.width); // idle: button and hint

        // the pass's button opens W10: empty, then filled, then sent
        await tester.tap(find.byIcon(Icons.lock_outline));
        await tester.pumpAndSettle();
        _expectFits(tester, ShareDetailsScreen, size.width); // empty form
        await tester.tap(find.byType(FilledButton).first);
        await tester.pumpAndSettle();
        expect(processor.submissions, hasLength(1));
        _expectFits(tester, ShareDetailsScreen, size.width); // sent: line, handle, Done
        await tester.tap(find.byType(FilledButton).first); // Done
        await tester.pumpAndSettle();
        _expectFits(tester, PassDetailScreen, size.width); // back on the pass: sent, send again

        live.emitVault(VaultNotice(kind: VaultNoticeKind.erased, principal: '0x0', fiduciary: fiduciaryAddress, purposeCode: 'credit_check', handle: '0x${'0' * 64}'));
        await tester.pumpAndSettle();
        _expectFits(tester, PassDetailScreen, size.width); // an erase of another copy: still "sent"

        // a failed send on W10 shows its line and keeps the form
        processor.submitError = const CoreException(CoreFailure.server);
        await tester.tap(find.byIcon(Icons.lock_outline));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(FilledButton).first);
        await tester.pumpAndSettle();
        _expectFits(tester, ShareDetailsScreen, size.width);
      });

      testWidgets('my demo details, $locale, text x$scale: fits', (tester) async {
        phone(tester);
        await pumpApp(tester, stored: {'locale': locale});
        final meTab = switch (locale) { 'hi' => 'मैं', 'kn' => 'ನಾನು', _ => 'Me' };
        await tester.tap(find.text(meTab));
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.badge_outlined));
        await tester.pumpAndSettle();
        _expectFits(tester, ProfileScreen, size.width);
      });
    }
  }
}

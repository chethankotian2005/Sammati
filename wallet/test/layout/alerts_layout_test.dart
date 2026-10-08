// The Alerts tab and the bottom bar that carries it, in English, Hindi and Kannada, on a small phone at large system
// text, with the real bundled fonts: no overflow, no text cut off or past the screen edge (see notice_layout_test.dart
// for why the fonts are loaded). Covers every kind of alert and the actions under it.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/core/alerts.dart';
import 'package:sammati/features/alerts/alerts_screen.dart';
import 'package:sammati/features/shell/home_shell.dart';

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
      // The rectangle as drawn: a label scaled down to fit its place has a smaller drawn size than its laid-out size.
      out.add((text: node.text.toPlainText(), rect: MatrixUtils.transformRect(node.getTransformTo(null), Offset.zero & node.size), truncated: node.didExceedMaxLines));
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
  const now = 1760000000;

  AlertItem alert(String id, AlertType type, {String? message, String? cause, int created = now - 90}) => AlertItem(
        id: id,
        type: type,
        fiduciary: fiduciaryAddress,
        company: 'QuickLoan Financial Services',
        color: '#2F5BEA',
        purposeId: creditCheckId,
        purposeCode: 'credit_check',
        createdAt: created,
        expiresAt: created + 259200,
        thresholdSeconds: type == AlertType.expiring ? 259200 : null,
        message: message,
        cause: cause,
        processorName: 'AdPartnerQ Marketing Services',
      );

  for (final locale in ['en', 'hi', 'kn']) {
    for (final scale in [1.0, 2.0]) {
      void phone(WidgetTester tester) {
        tester.view.devicePixelRatio = 2;
        tester.view.physicalSize = const Size(width, 6000) * 2;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(() {
          tester.view.reset();
          tester.platformDispatcher.clearAllTestValues();
        });
      }

      testWidgets('alerts, $locale, text x$scale: every kind of alert and its actions fit', (tester) async {
        phone(tester);
        final core = FakeCoreApi()
          ..alerts = [
            alert('a1', AlertType.expiring),
            alert('a2', AlertType.expired),
            alert('a3', AlertType.renewalRequested, message: 'Your loan application is ready for review. Please renew so we can continue.'),
            alert('a4', AlertType.dataErased, cause: 'withdrawn'),
            alert('a5', AlertType.dataErased, cause: 'expired'),
            alert('a6', AlertType.cascadeAcknowledged),
            alert('a7', AlertType.expiring, created: now - 3 * 86400),
            alert('a8', AlertType.expiring, created: now - 80).copyWith(actionTaken: AlertAction.letExpire, readAt: now),
          ];
        core.seed(creditCheckId, expiresAt: now + 86400);
        await pumpApp(tester, stored: {'locale': locale}, core: core);
        await tester.tap(find.byIcon(Icons.notifications_outlined));
        await tester.pumpAndSettle();
        _expectFits(tester, AlertsScreen, width);
      });

      testWidgets('the bottom bar with six places, $locale, text x$scale: no label is cut off and each place is at least 48 dp wide', (tester) async {
        phone(tester);
        await pumpApp(tester, stored: {'locale': locale}, core: FakeCoreApi()..alerts = [alert('a1', AlertType.expiring)]);
        expect(tester.takeException(), isNull);
        final bar = _paragraphs(tester.renderObject(find.byType(BottomAppBar)));
        expect(bar.length, greaterThanOrEqualTo(5)); // Consents, Activity, Alerts, Rights, Me (the scan button has a tooltip, not text)
        for (final p in bar) {
          expect(p.truncated, isFalse, reason: '"${p.text}" is cut off in the bottom bar');
          expect(p.rect.left, greaterThanOrEqualTo(-0.5));
          expect(p.rect.right, lessThanOrEqualTo(width + 0.5), reason: '"${p.text}" runs past the right edge');
        }
        final items = tester.widgetList<InkWell>(find.descendant(of: find.byType(HomeShell), matching: find.byType(InkWell))).length;
        expect(items, greaterThanOrEqualTo(5));
        for (final e in find.descendant(of: find.byType(BottomAppBar), matching: find.byType(InkWell)).evaluate()) {
          final size = (e.renderObject! as RenderBox).size;
          expect(size.width, greaterThanOrEqualTo(48), reason: 'a bottom-bar place is too narrow to tap');
          expect(size.height, greaterThanOrEqualTo(48));
        }
      });
    }
  }
}

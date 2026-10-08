// The consent notice in English, Hindi and Kannada, at small and typical phone sizes and at larger system text.
//
// It renders the real notice screen with the real bundled fonts and the proposed Hindi/Kannada purpose text from
// docs/copy-hi-kn.md (the longest strings the notice will carry), and fails on:
//   - any Flutter layout exception (a RenderFlex overflow is reported as one),
//   - any paragraph cut off by a line limit,
//   - any text that extends past the left or right edge of the screen.
//
// To also write a PNG per case for looking at:
//   flutter test test/layout --dart-define=SCREENSHOT_DIR=C:/some/folder

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sammati/features/consent/notice_screen.dart';

import '../support/fake_core.dart';
import '../support/pump_app.dart';

const _screenshotDir = String.fromEnvironment('SCREENSHOT_DIR');

class _Row {
  const _Row(this.code, this.en, this.hi, this.kn);
  final String code;
  final ({String title, String description}) en, hi, kn;
}

/// The nine rows of docs/copy-hi-kn.md.
List<_Row> _copy() {
  final doc = File('../docs/copy-hi-kn.md').readAsStringSync();
  final rows = <_Row>[];
  for (final line in doc.split('\n')) {
    final m = RegExp(r'^\| `(\w+)` \|(.*)\|\s*$').firstMatch(line.trimRight());
    if (m == null) continue;
    final c = m.group(2)!.split('|').map((s) => s.trim()).toList();
    if (c.length != 6) continue;
    rows.add(_Row(m.group(1)!, (title: c[0], description: c[1]), (title: c[2], description: c[3]), (title: c[4], description: c[5])));
  }
  return rows;
}

const _detail = <String, ({List<String> categories, int days, bool shares, bool required})>{
  'credit_check': (categories: ['PAN', 'income', '12 months of statements'], days: 365, shares: false, required: false),
  'marketing': (categories: ['phone', 'email'], days: 180, shares: true, required: false),
  'bureau_share': (categories: ['repayment history'], days: 1095, shares: true, required: false),
  'treatment': (categories: ['medical records'], days: 3650, shares: false, required: true),
  'insurance_claim': (categories: ['medical records', 'billing'], days: 730, shares: true, required: false),
  'research': (categories: ['anonymised records'], days: 1825, shares: true, required: false),
  'delivery': (categories: ['location'], days: 30, shares: false, required: true),
  'ad_targeting': (categories: ['order history'], days: 180, shares: true, required: false),
  'partner_share': (categories: ['order history'], days: 90, shares: true, required: false),
};

const _companies = <(String, String, List<String>)>[
  ('QuickLoan', '#2F5BEA', ['credit_check', 'marketing', 'bureau_share']),
  ('MediCare+', '#0E9AA7', ['treatment', 'insurance_claim', 'research']),
  ('FoodRush', '#E4572E', ['delivery', 'ad_targeting', 'partner_share']),
];

Map<String, dynamic> _notice(String company, String color, List<String> codes, List<_Row> copy) {
  final json = buildNoticeJson();
  (json['fiduciary'] as Map<String, dynamic>)
    ..['name'] = company
    ..['color'] = color;
  json['purposes'] = [
    for (var i = 0; i < codes.length; i++)
      () {
        final row = copy.firstWhere((r) => r.code == codes[i]);
        final d = _detail[row.code]!;
        return {
          'id': '0x${(i + 1).toRadixString(16).padLeft(64, '0')}',
          'code': row.code,
          'title': {'en': row.en.title, 'hi': row.hi.title, 'kn': row.kn.title},
          'description': {'en': row.en.description, 'hi': row.hi.description, 'kn': row.kn.description},
          'dataCategories': d.categories,
          'retentionDays': d.days,
          'sharesThirdParty': d.shares,
          'required': d.required,
        };
      }(),
  ];
  json['noticeHash'] = noticeHashOf(json);
  return json;
}

/// Every paragraph on screen with where it sits and whether a line limit cut it off.
List<({String text, Rect rect, bool truncated})> _paragraphs(WidgetTester tester) {
  final out = <({String text, Rect rect, bool truncated})>[];
  void visit(RenderObject node) {
    if (node is RenderParagraph && node.attached && node.hasSize && node.size.width > 0) {
      final topLeft = node.localToGlobal(Offset.zero);
      out.add((text: node.text.toPlainText(), rect: topLeft & node.size, truncated: node.didExceedMaxLines));
    }
    node.visitChildren(visit);
  }

  // only the notice: the home screen stays in the navigator underneath it
  visit(tester.renderObject(find.byType(NoticeScreen)));
  return out;
}

Future<void> _snapshot(WidgetTester tester, String name) async {
  if (_screenshotDir.isEmpty) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(find.byType(RepaintBoundary).first);
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
    await Directory(_screenshotDir).create(recursive: true);
    await File('$_screenshotDir/$name.png').writeAsBytes(bytes.buffer.asUint8List());
  });
}

Future<void> _openNotice(WidgetTester tester, Map<String, dynamic> notice, String locale) async {
  await pumpApp(tester, stored: {'locale': locale}, core: FakeCoreApi(notice: notice));
  await tester.tap(find.byIcon(Icons.qr_code_scanner));
  await tester.pumpAndSettle();
  await tester.tap(find.text('read valid qr'));
  await tester.pumpAndSettle();
}

/// Widget tests draw every glyph as a square (the Ahem font) unless real fonts are loaded, which would make the
/// measurements meaningless for Devanagari and Kannada. Load the same files the app bundles.
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

void main() {
  final copy = _copy();

  setUpAll(_loadBundledFonts);

  test('the copy file has all nine purposes', () {
    expect(copy.map((r) => r.code), _detail.keys);
  });

  const sizes = <(String, Size)>[('small-360x640', Size(360, 640)), ('typical-412x915', Size(412, 915))];
  const scales = [1.0, 1.5, 2.0];

  for (final (company, color, codes) in _companies) {
    for (final locale in ['en', 'hi', 'kn']) {
      for (final (sizeName, size) in sizes) {
        for (final scale in scales) {
          testWidgets('$company notice, $locale, $sizeName, text x$scale: nothing clipped or overflowing', (tester) async {
            tester.view.devicePixelRatio = 2;
            tester.platformDispatcher.textScaleFactorTestValue = scale;
            addTearDown(() {
              tester.view.reset();
              tester.platformDispatcher.clearAllTestValues();
            });

            // The notice is a scrolling list that builds only what is near the screen. Lay the whole thing out on a
            // surface as wide as the phone and tall enough for every purpose, then check widths: wrapping and
            // clipping depend on width, not height.
            tester.view.physicalSize = Size(size.width, 4200) * 2;
            await _openNotice(tester, _notice(company, color, codes, copy), locale);
            final thrown = tester.takeException();
            if (thrown is FlutterError) debugPrint(thrown.toStringDeep());
            expect(thrown, isNull, reason: 'a layout exception (overflow) while rendering');

            for (final code in codes) {
              final row = copy.firstWhere((r) => r.code == code);
              final title = switch (locale) { 'hi' => row.hi.title, 'kn' => row.kn.title, _ => row.en.title };
              expect(find.text(title), findsWidgets, reason: 'title for $code in $locale');
            }

            final paragraphs = _paragraphs(tester);
            expect(paragraphs, isNotEmpty);
            for (final p in paragraphs) {
              expect(p.truncated, isFalse, reason: '"${p.text}" is cut off by a line limit');
              expect(p.rect.left, greaterThanOrEqualTo(-0.5), reason: '"${p.text}" starts left of the screen');
              expect(p.rect.right, lessThanOrEqualTo(size.width + 0.5), reason: '"${p.text}" runs past the right edge (${p.rect.right} > ${size.width})');
            }
            final name = '${company.replaceAll('+', 'plus')}_${locale}_${sizeName}_x$scale';
            await _snapshot(tester, '${name}_full');

            // And as the phone really shows it: the first screen, with the action button still reachable.
            tester.view.physicalSize = size * 2;
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: 'a layout exception at phone height');
            final button = find.byType(FilledButton);
            expect(button, findsWidgets);
            final rect = tester.getRect(button.last);
            expect(rect.bottom, lessThanOrEqualTo(size.height + 0.5), reason: 'the consent button is pushed off the bottom of the screen');
            expect(rect.right, lessThanOrEqualTo(size.width + 0.5));
            await _snapshot(tester, '${name}_phone');
          }, timeout: const Timeout(Duration(minutes: 2)));
        }
      }
    }
  }
}

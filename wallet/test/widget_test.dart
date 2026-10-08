import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';
import 'support/pump_app.dart';

Future<void> goToMe(WidgetTester tester) async {
  await tester.tap(find.text('Me'));
  await tester.pumpAndSettle();
}

void main() {
  group('shell', () {
    testWidgets('shows the four tabs and the scan button', (tester) async {
      await pumpApp(tester);
      for (final label in ['Consents', 'Activity', 'Rights', 'Me']) {
        expect(find.text(label), findsWidgets);
      }
      expect(find.byTooltip('Scan'), findsOneWidget);
      expect(find.text('No companies yet. Scan a QR code to connect your first one.'), findsOneWidget);
    });

    testWidgets('scan button opens the scan screen', (tester) async {
      await pumpApp(tester);
      await tester.tap(find.byTooltip('Scan'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Scan to connect'), findsOneWidget);
    });

    testWidgets('language switches at runtime and persists', (tester) async {
      await pumpApp(tester);
      await goToMe(tester);
      await tester.tap(find.text('हिन्दी'));
      await tester.pumpAndSettle();
      expect(find.text('सहमतियाँ'), findsWidgets);
      expect((await SharedPreferences.getInstance()).getString('locale'), 'hi');

      await tester.tap(find.text('ಕನ್ನಡ'));
      await tester.pumpAndSettle();
      expect(find.text('ಒಪ್ಪಿಗೆಗಳು'), findsWidgets);
    });

    testWidgets('saved language is restored on launch', (tester) async {
      await pumpApp(tester, stored: {'locale': 'kn'});
      expect(find.text('ಒಪ್ಪಿಗೆಗಳು'), findsWidgets);
    });

    testWidgets('dev settings rejects a bad Core URL and stores a good one', (tester) async {
      await pumpApp(tester);
      await goToMe(tester);
      await tester.tap(find.text('Developer settings'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'not a url');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a full address starting with http:// or https://'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'http://192.168.1.5:4000/');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect((await SharedPreferences.getInstance()).getString('core_url'), 'http://192.168.1.5:4000');
    });

    testWidgets('the Me tab shows the shortened wallet address', (tester) async {
      await pumpApp(tester);
      await goToMe(tester);
      expect(find.text('Wallet address'), findsOneWidget);
      final shortAddress = RegExp(r'^0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}$');
      expect(find.byWidgetPredicate((w) => w is Text && shortAddress.hasMatch(w.data ?? '')), findsOneWidget);
    });
  });

  group('first launch', () {
    Future<void> throughOnboarding(WidgetTester tester) async {
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byType(FilledButton));
        await tester.pumpAndSettle();
      }
    }

    testWidgets('walks language, three onboarding screens, wallet creation, then home', (tester) async {
      await pumpApp(tester, withWallet: false);
      expect(find.text('Choose your language'), findsOneWidget);

      await tester.tap(find.text('हिन्दी'));
      await tester.pumpAndSettle();
      expect(find.text('अपनी भाषा चुनें'), findsOneWidget);
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      for (final text in [
        'See every company that has your consent',
        'Say yes to a purpose, not to everything',
        'Withdraw in one tap',
      ]) {
        expect(find.text(text), findsOneWidget);
        await tester.tap(find.byType(FilledButton));
        await tester.pumpAndSettle();
      }

      expect(find.text('Secure with fingerprint or PIN'), findsOneWidget);
      await tester.tap(find.text('Create wallet'));
      await tester.pumpAndSettle();
      expect(find.text('No companies yet. Scan a QR code to connect your first one.'), findsOneWidget);
    });

    testWidgets('explains and stays on setup when the phone has no screen lock', (tester) async {
      await pumpApp(tester, withWallet: false, presence: FakePresence(available: false));
      await throughOnboarding(tester);
      await tester.tap(find.text('Create wallet'));
      await tester.pumpAndSettle();
      expect(find.text('Set a screen lock on this phone, then try again.'), findsOneWidget);
      expect(find.text('Create wallet'), findsOneWidget);
    });

    testWidgets('stays on setup when the user does not confirm', (tester) async {
      await pumpApp(tester, withWallet: false, presence: FakePresence(approve: false));
      await throughOnboarding(tester);
      await tester.tap(find.text('Create wallet'));
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm it is you. Try again.'), findsOneWidget);
    });

    testWidgets('an existing wallet skips setup', (tester) async {
      await pumpApp(tester);
      expect(find.text('Choose your language'), findsNothing);
      expect(find.text('Consents'), findsWidgets);
    });
  });
}

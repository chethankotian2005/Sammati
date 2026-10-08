// Account creation and the profile across an app restart (W-15, W-16, W-17; ui.md W14, W15).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fake_core.dart';
import 'support/fakes.dart';
import 'support/pump_app.dart';

Future<void> toIdStep(WidgetTester tester) async {
  await tester.tap(find.text('Continue'));
  await tester.pumpAndSettle();
  for (var i = 0; i < 3; i++) {
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
  }
}

void main() {
  testWidgets('choose an available ID, secure the phone, fill some details, kill the app, reopen, unlock, see them', (tester) async {
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final vault = FakeVault();
    final core = FakeCoreApi()..takenHandles.add('asha@sammati');
    await pumpApp(tester, withWallet: false, vault: vault, core: core);
    await toIdStep(tester);

    // step 1: a taken ID is refused, a free one continues
    await tester.enterText(find.byType(TextField), 'asha');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.text('That ID is taken. Try another.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Continue')).onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'asha.rao');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.text('asha.rao@sammati is available'), findsOneWidget);
    expect(core.handleChecks, containsAll(['asha@sammati', 'asha.rao@sammati']));
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();

    // step 2: the device lock creates the wallet and registers the ID
    await tester.tap(find.text('Create wallet'));
    await tester.pumpAndSettle();
    expect(core.registrations.single.handle, 'asha.rao@sammati');

    // step 3: every field is optional; fill two
    expect(find.text('Your details'), findsWidgets);
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Asha Rao');
    await tester.pump();
    await tester.tap(find.text('How to reach you'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '9876501234');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save and continue'));
    await tester.pumpAndSettle();
    expect(find.text('Consents'), findsWidgets); // on Home

    // the app is killed: a new instance with the same secure storage and preferences
    await tester.pumpWidget(const SizedBox());
    final prefsKeep = <String, Object>{'account_setup_done': true};
    await pumpApp(tester, withWallet: false, vault: vault, stored: prefsKeep, core: core);
    // the wallet exists in the storage, so the app opens on Home
    await tester.tap(find.text('Me'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My details'));
    await tester.pumpAndSettle();
    expect(find.text('Asha Rao'), findsOneWidget);
    expect(find.text('9876501234'), findsOneWidget);
    expect(find.text('Not added'), findsWidgets);
  });

  testWidgets('My details is locked when the device check is refused, and shows nothing', (tester) async {
    final presence = FakePresence();
    await pumpApp(tester, presence: presence, profile: {'pan': 'QZXWV9876K'});
    presence.approve = false;
    await tester.tap(find.text('Me'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My details'));
    await tester.pumpAndSettle();
    expect(find.text('Your details are locked'), findsOneWidget);
    expect(find.text('QZXWV9876K'), findsNothing);
  });

  testWidgets('editing a detail already sent marks the consent, and one tap sends the new value', (tester) async {
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final processor = FakeProcessorApi();
    final core = FakeCoreApi()..seed(creditCheckId, expiresAt: 1760000000 + 150 * 86400);
    await pumpApp(tester, core: core, processor: processor, profile: {'pan': 'QZXWV9876K', 'incomeBand': '6-9 LPA', 'employment': 'salaried'});

    // share once (from the pass)
    await tester.tap(find.text('QuickLoan'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.lock_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Send securely'));
    await tester.pumpAndSettle();
    expect(processor.submissions, hasLength(1));
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.textContaining('Your details changed'), findsNothing);

    // edit the PAN in My details
    await tester.tap(find.text('Me'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My details'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('PAN'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'PAN'), 'ABCDE1234F');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Home marks the consent; one tap re-sends
    await tester.tap(find.text('Consents').first);
    await tester.pumpAndSettle();
    expect(find.text('Your details changed. Update what QuickLoan holds?'), findsOneWidget);
    await tester.tap(find.text('Update'));
    await tester.pumpAndSettle();
    expect(processor.submissions, hasLength(2));
    expect(find.textContaining('Your details changed'), findsNothing);
  });
}

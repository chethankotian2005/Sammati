import 'package:flutter_test/flutter_test.dart';
import 'package:sammati/main.dart';

void main() {
  testWidgets('app shell builds', (tester) async {
    await tester.pumpWidget(const SammatiApp());
    expect(find.byType(SammatiApp), findsOneWidget);
  });
}
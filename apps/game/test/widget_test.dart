import 'package:flutter_test/flutter_test.dart';
import 'package:word_rush_arena/src/app.dart';

void main() {
  testWidgets('home screen exposes room actions', (tester) async {
    await tester.pumpWidget(const WordRushApp());
    expect(find.text('ODA KUR'), findsOneWidget);
    expect(find.text('KODLA KATIL'), findsOneWidget);
  });
}

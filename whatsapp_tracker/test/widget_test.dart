import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:whatsapp_tracker/providers/auth_provider.dart';
import 'package:whatsapp_tracker/providers/contacts_provider.dart';
import 'package:whatsapp_tracker/screens/splash_screen.dart';
import 'package:whatsapp_tracker/theme/app_theme.dart';

void main() {
  testWidgets('SplashScreen renders branding elements', (WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => ContactsProvider()),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const SplashScreen(),
        ),
      ),
    );

    // First frame renders the splash scaffold and branding text.
    expect(find.text('WA Last Seen'), findsOneWidget);
    expect(find.byIcon(Icons.visibility), findsOneWidget);

    // Drain the 1800ms Future.delayed and animation controller so no
    // pending timers remain when the test tears down.  The auto-login
    // network call will throw (no real server) which is caught by the
    // mounted-check guard, so we just need to settle the futures.
    await tester.pump(const Duration(milliseconds: 2000));
    await tester.pumpAndSettle();
  });
}

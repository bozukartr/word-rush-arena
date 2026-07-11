import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/firebase_bootstrap.dart';
import 'src/word_rules.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await FirebaseBootstrap.initialize();
  } catch (error, stackTrace) {
    debugPrint('Firebase bootstrap failed, continuing without it: $error\n$stackTrace');
  }
  try {
    await loadDictionary();
  } catch (error, stackTrace) {
    debugPrint('Dictionary failed to load, words will be rejected: $error\n$stackTrace');
  }
  runApp(const WordRushApp());
}

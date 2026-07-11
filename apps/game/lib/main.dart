import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/firebase_bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await FirebaseBootstrap.initialize();
  } catch (error, stackTrace) {
    debugPrint('Firebase bootstrap failed, continuing without it: $error\n$stackTrace');
  }
  runApp(const WordRushApp());
}

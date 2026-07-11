import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/firebase_bootstrap.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await FirebaseBootstrap.initialize();
  runApp(const WordRushApp());
}

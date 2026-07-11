import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'firebase_options.dart';

class FirebaseBootstrap {
  static const _nativeApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const _nativeAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const _nativeMessagingSenderId =
      String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const _projectId = 'wordrusharena';
  static const _authDomain = 'wordrusharena.firebaseapp.com';
  static const _storageBucket = 'wordrusharena.firebasestorage.app';

  static FirebaseAnalytics? analytics;

  static bool get isConfigured =>
      kIsWeb || (_nativeApiKey.isNotEmpty && _nativeAppId.isNotEmpty);

  static FirebaseOptions get _options {
    if (kIsWeb) return DefaultFirebaseOptions.web;
    return const FirebaseOptions(
      apiKey: _nativeApiKey,
      appId: _nativeAppId,
      messagingSenderId: _nativeMessagingSenderId,
      projectId: _projectId,
      authDomain: _authDomain,
      storageBucket: _storageBucket,
    );
  }

  static Future<void> initialize() async {
    if (!isConfigured) return;
    await Firebase.initializeApp(options: _options);
    analytics = FirebaseAnalytics.instance;
    await FirebaseAuth.instance.signInAnonymously();
  }

  static Future<String?> idToken() async {
    if (!isConfigured || Firebase.apps.isEmpty) return null;
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;
    return user.getIdToken();
  }
}

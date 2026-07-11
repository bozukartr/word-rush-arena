import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase client configuration for the registered web application.
///
/// Firebase API keys identify the client project; authorization is enforced by
/// Authentication, App Check, and Firebase Security Rules.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    throw UnsupportedError(
      'Firebase is currently registered for Web only. Register Android and '
      'iOS apps, then add their platform-specific options.',
    );
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyA-O_e7Kp5GgTNTRWgE0fF2BsEgxdphEok',
    authDomain: 'wordrusharena.firebaseapp.com',
    projectId: 'wordrusharena',
    storageBucket: 'wordrusharena.firebasestorage.app',
    messagingSenderId: '904130413504',
    appId: '1:904130413504:web:51f7336099081ec9e1be25',
    measurementId: 'G-7KP83HN363',
  );
}

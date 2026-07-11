import 'package:flutter/material.dart';

/// A calm, minimal "premium" palette — soft neutral surfaces with a single
/// indigo accent and a warm gold used only for scores/highlights.
abstract final class AppColors {
  static const indigo = Color(0xFF4F5DFF);
  static const indigoDark = Color(0xFF7C87FF);
  static const gold = Color(0xFFE3A11B);
  static const goldDark = Color(0xFFFFC857);
  static const error = Color(0xFFE5484D);
  static const errorDark = Color(0xFFFF6B6E);

  static const lightBackgroundTop = Color(0xFFF8F9FD);
  static const lightBackgroundBottom = Color(0xFFEBEEFA);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightBorder = Color(0xFFE4E7F2);
  static const lightInk = Color(0xFF1B1D2B);
  static const lightMuted = Color(0xFF6B7280);

  static const darkBackgroundTop = Color(0xFF12131F);
  static const darkBackgroundBottom = Color(0xFF181A2E);
  static const darkSurface = Color(0xFF1F2136);
  static const darkBorder = Color(0xFF2C2F49);
  static const darkInk = Color(0xFFF4F5FA);
  static const darkMuted = Color(0xFF9BA0C0);
}

LinearGradient appBackgroundGradient(Brightness brightness) => LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: brightness == Brightness.dark
          ? const [AppColors.darkBackgroundTop, AppColors.darkBackgroundBottom]
          : const [AppColors.lightBackgroundTop, AppColors.lightBackgroundBottom],
    );

ThemeData buildAppTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: isDark ? AppColors.indigoDark : AppColors.indigo,
    onPrimary: Colors.white,
    secondary: isDark ? AppColors.goldDark : AppColors.gold,
    onSecondary: isDark ? AppColors.darkInk : AppColors.lightInk,
    error: isDark ? AppColors.errorDark : AppColors.error,
    onError: Colors.white,
    surface: isDark ? AppColors.darkSurface : AppColors.lightSurface,
    onSurface: isDark ? AppColors.darkInk : AppColors.lightInk,
  );

  final muted = isDark ? AppColors.darkMuted : AppColors.lightMuted;
  final border = isDark ? AppColors.darkBorder : AppColors.lightBorder;

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: Colors.transparent,
    fontFamily: 'Poppins',
    textTheme: TextTheme(
      displaySmall: TextStyle(fontWeight: FontWeight.w800, color: scheme.onSurface, letterSpacing: -0.5),
      headlineSmall: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurface),
      titleLarge: TextStyle(fontWeight: FontWeight.w600, color: scheme.onSurface),
      titleMedium: TextStyle(fontWeight: FontWeight.w600, color: scheme.onSurface),
      bodyLarge: TextStyle(fontWeight: FontWeight.w400, color: scheme.onSurface),
      bodyMedium: TextStyle(fontWeight: FontWeight.w400, color: muted),
      labelLarge: TextStyle(fontWeight: FontWeight.w600, color: muted, letterSpacing: 0.6),
      labelMedium: TextStyle(fontWeight: FontWeight.w600, color: muted, letterSpacing: 1.1, fontSize: 12),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: isDark ? AppColors.darkBackgroundTop : const Color(0xFFF3F5FB),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: scheme.primary, width: 1.6),
      ),
      labelStyle: TextStyle(color: muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: scheme.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: border,
        disabledForegroundColor: muted,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.primary,
        disabledForegroundColor: muted,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        side: BorderSide(color: scheme.primary.withValues(alpha: 0.4), width: 1.4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ).copyWith(
        side: WidgetStateProperty.resolveWith(
          (states) => BorderSide(
            color: states.contains(WidgetState.disabled) ? border : scheme.primary.withValues(alpha: 0.4),
            width: 1.4,
          ),
        ),
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: border),
      ),
    ),
    dividerTheme: DividerThemeData(color: border),
  );
}

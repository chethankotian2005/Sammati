import 'package:flutter/material.dart';

import 'tokens.dart';

/// Scale from ui.md §1.2: 28 / 20 / 16 / 14 / 12, minimum body size 14.
abstract final class SammatiType {
  static const title = 28.0;
  static const heading = 20.0;
  static const body = 16.0;
  static const small = 14.0;
  static const caption = 12.0;
}

const _latinFont = 'Manrope';

/// Hashes and transaction ids (ui.md §1.2).
TextStyle monoStyle({double size = SammatiType.small, Color color = SammatiColors.ink}) => TextStyle(
      fontFamily: 'IBMPlexMono',
      fontSize: size,
      fontWeight: FontWeight.w500,
      color: color,
    );

// Flutter picks fallbacks per glyph, so Devanagari and Kannada text renders
// from the bundled Noto fonts whichever language is selected.
const _fontFallback = ['NotoSansDevanagari', 'NotoSansKannada'];

TextStyle _style(double size, FontWeight weight, {Color color = SammatiColors.ink}) => TextStyle(
      fontFamily: _latinFont,
      fontFamilyFallback: _fontFallback,
      fontSize: size,
      fontWeight: weight,
      color: color,
      // Indic scripts need more line height than Latin to avoid clipped matras.
      height: 1.4,
    );

ThemeData buildSammatiTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SammatiColors.ink,
    brightness: Brightness.light,
  ).copyWith(
    primary: SammatiColors.ink,
    onPrimary: SammatiColors.surface,
    secondary: SammatiColors.marigold,
    onSecondary: SammatiColors.ink,
    surface: SammatiColors.surface,
    onSurface: SammatiColors.ink,
    error: SammatiColors.block,
    outline: SammatiColors.line,
  );

  final textTheme = TextTheme(
    headlineMedium: _style(SammatiType.title, FontWeight.w800),
    titleLarge: _style(SammatiType.heading, FontWeight.w700),
    titleMedium: _style(SammatiType.body, FontWeight.w700),
    bodyLarge: _style(SammatiType.body, FontWeight.w400),
    bodyMedium: _style(SammatiType.small, FontWeight.w400),
    labelLarge: _style(SammatiType.small, FontWeight.w700),
    bodySmall: _style(SammatiType.caption, FontWeight.w500, color: SammatiColors.mute),
  );

  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: SammatiColors.paper,
    fontFamily: _latinFont,
    fontFamilyFallback: _fontFallback,
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: SammatiColors.ink,
      foregroundColor: SammatiColors.surface,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: _style(SammatiType.heading, FontWeight.w700, color: SammatiColors.surface),
    ),
    dividerTheme: const DividerThemeData(color: SammatiColors.line, space: 1, thickness: 1),
    cardTheme: CardThemeData(
      color: SammatiColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SammatiRadius.pass),
        side: const BorderSide(color: SammatiColors.line),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: SammatiColors.ink,
        foregroundColor: SammatiColors.surface,
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SammatiRadius.pill)),
        textStyle: _style(SammatiType.body, FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SammatiColors.surface,
      border: border(SammatiColors.line),
      enabledBorder: border(SammatiColors.line),
      focusedBorder: border(SammatiColors.ink, 2),
      errorBorder: border(SammatiColors.block),
      focusedErrorBorder: border(SammatiColors.block, 2),
    ),
  );
}

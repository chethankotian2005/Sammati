// Design tokens from docs/ui.md §1.1. Do not add colours here without
// updating the spec first.

import 'package:flutter/material.dart';

abstract final class SammatiColors {
  static const ink = Color(0xFF16173F);
  static const marigold = Color(0xFFF4A300);
  static const paper = Color(0xFFF6F7FB);
  static const surface = Color(0xFFFFFFFF);
  static const allow = Color(0xFF12805C);
  static const block = Color(0xFFC8283B);
  static const mute = Color(0xFF6B6F8C);
  static const line = Color(0xFFE3E5F0);

  // Company pass headers.
  static const quickLoan = Color(0xFF2F5BEA);
  static const mediCare = Color(0xFF0E9AA7);
  static const foodRush = Color(0xFFE4572E);
}

/// Radii from ui.md §1.3: passes and sheets, rows, and pill shapes differ on purpose.
abstract final class SammatiRadius {
  static const pass = 20.0;
  static const row = 14.0;
  static const pill = 999.0;
}

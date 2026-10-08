import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A TextButton with this label, including `TextButton.icon`. That constructor builds a private subclass
/// in some Flutter versions, and `find.widgetWithText(TextButton, ...)` matches the exact type only.
Finder textButtonWithText(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((w) => w is TextButton),
    );

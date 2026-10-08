import 'package:flutter/material.dart';

import '../../l10n/generated/app_localizations.dart';
import '../../theme/tokens.dart';

/// The language list shared by onboarding and the Me tab. Each language is named
/// in its own script so it can be found whatever the current language is.
class LanguageOptions extends StatelessWidget {
  const LanguageOptions({super.key, required this.current, required this.onSelected});

  final String current;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final languages = {'en': t.language_english, 'hi': t.language_hindi, 'kn': t.language_kannada};
    return Material(
      color: SammatiColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SammatiRadius.row),
        side: const BorderSide(color: SammatiColors.line),
      ),
      child: Column(
        children: [
          for (final entry in languages.entries)
            ListTile(
              minTileHeight: 56,
              title: Text(entry.value),
              trailing: entry.key == current ? const Icon(Icons.check, color: SammatiColors.allow) : null,
              selected: entry.key == current,
              selectedColor: SammatiColors.ink,
              onTap: () => onSelected(entry.key),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/format.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/app_theme.dart';

/// A hash or transaction id: shortened on screen, copied in full on tap (AGENTS.md).
class HashText extends StatelessWidget {
  const HashText(this.value, {super.key});

  final String value;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return InkWell(
      onTap: () async {
        final messenger = ScaffoldMessenger.of(context);
        await Clipboard.setData(ClipboardData(text: value));
        messenger.showSnackBar(SnackBar(content: Text(t.copied)));
      },
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(shortHex(value), style: monoStyle()),
            const SizedBox(width: 8),
            const Icon(Icons.copy, size: 16),
          ],
        ),
      ),
    );
  }
}
